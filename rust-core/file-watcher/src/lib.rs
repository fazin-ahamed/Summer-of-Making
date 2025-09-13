use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::sync::{mpsc, RwLock, Mutex};
use notify::{Watcher, RecursiveMode, Event, EventKind, CreateKind, ModifyKind, RemoveKind};
use anyhow::{Result, anyhow};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use tracing::{info, warn, error};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileWatcherEvent {
    pub id: String,
    pub event_type: FileEventType,
    pub file_path: PathBuf,
    pub timestamp: DateTime<Utc>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileEventType {
    Created,
    Modified,
    Deleted,
    Renamed { from: PathBuf, to: PathBuf },
}

pub trait FileWatcherCallback: Send + Sync + 'static {
    fn on_file_event(&self, event: FileWatcherEvent);
}

pub struct FileWatcher {
    watch_paths: Vec<PathBuf>,
    callback: Arc<dyn FileWatcherCallback>,
    watcher: Option<Arc<Mutex<notify::RecommendedWatcher>>>,
    is_running: Arc<RwLock<bool>>,
    event_sender: Option<mpsc::UnboundedSender<FileWatcherEvent>>,
    _event_receiver_handle: Option<tokio::task::JoinHandle<()>>,
}

impl FileWatcher {
    pub fn new<P>(
        watch_paths: Vec<P>,
        callback: Arc<dyn FileWatcherCallback>,
    ) -> Result<Self>
    where
        P: AsRef<Path>,
    {
        let watch_paths: Vec<PathBuf> = watch_paths
            .into_iter()
            .map(|p| p.as_ref().to_path_buf())
            .collect();

        // Validate that all paths exist
        for path in &watch_paths {
            if !path.exists() {
                return Err(anyhow!("Watch path does not exist: {}", path.display()));
            }
        }

        Ok(Self {
            watch_paths,
            callback,
            watcher: None,
            is_running: Arc::new(RwLock::new(false)),
            event_sender: None,
            _event_receiver_handle: None,
        })
    }

    pub async fn start(&mut self) -> Result<()> {
        let mut is_running = self.is_running.write().await;
        if *is_running {
            return Ok(());
        }

        info!("Starting file watcher for {} paths", self.watch_paths.len());

        // Create event channel
        let (event_sender, mut event_receiver) = mpsc::unbounded_channel();
        self.event_sender = Some(event_sender.clone());

        // Create file system watcher
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            match res {
                Ok(event) => {
                    if let Some(file_event) = Self::convert_notify_event(event) {
                        if let Err(e) = event_sender.send(file_event) {
                            error!("Failed to send file event: {}", e);
                        }
                    }
                }
                Err(e) => error!("File watcher error: {:?}", e),
            }
        })?;

        // Watch all specified paths
        for path in &self.watch_paths {
            info!("Watching path: {}", path.display());
            watcher.watch(path, RecursiveMode::Recursive)?;
        }

        self.watcher = Some(Arc::new(Mutex::new(watcher)));

        // Start event processing task
        let callback = Arc::clone(&self.callback);
        let event_handle = tokio::spawn(async move {
            while let Some(event) = event_receiver.recv().await {
                callback.on_file_event(event);
            }
        });

        self._event_receiver_handle = Some(event_handle);
        *is_running = true;

        info!("File watcher started successfully");
        Ok(())
    }

    pub async fn stop(&self) {
        let mut is_running = self.is_running.write().await;
        if !*is_running {
            return;
        }

        info!("Stopping file watcher");

        // Stop the watcher
        if let Some(watcher) = &self.watcher {
            if let Ok(mut w) = watcher.try_lock() {
                // Watcher will be dropped, which stops it
                drop(w);
            }
        }

        // Close event channel
        if let Some(sender) = &self.event_sender {
            sender.closed().await;
        }

        *is_running = false;
        info!("File watcher stopped");
    }

    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }

    pub fn get_watch_paths(&self) -> &[PathBuf] {
        &self.watch_paths
    }

    fn convert_notify_event(event: Event) -> Option<FileWatcherEvent> {
        let event_type = match event.kind {
            EventKind::Create(CreateKind::File) => FileEventType::Created,
            EventKind::Modify(ModifyKind::Data(_)) => FileEventType::Modified,
            EventKind::Remove(RemoveKind::File) => FileEventType::Deleted,
            EventKind::Modify(ModifyKind::Name(notify::event::RenameMode::Both)) => {
                if event.paths.len() >= 2 {
                    FileEventType::Renamed {
                        from: event.paths[0].clone(),
                        to: event.paths[1].clone(),
                    }
                } else {
                    return None;
                }
            }
            _ => return None, // Ignore other event types
        };

        let file_path = event.paths.first()?.clone();
        
        // Filter out temporary files and system files
        if Self::should_ignore_file(&file_path) {
            return None;
        }

        Some(FileWatcherEvent {
            id: Uuid::new_v4().to_string(),
            event_type,
            file_path,
            timestamp: Utc::now(),
            metadata: None,
        })
    }

    fn should_ignore_file(path: &Path) -> bool {
        let file_name = path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");

        // Ignore temporary files
        if file_name.starts_with('.') || 
           file_name.starts_with('~') || 
           file_name.ends_with(".tmp") ||
           file_name.ends_with(".temp") ||
           file_name.ends_with(".swp") ||
           file_name.ends_with(".swo") {
            return true;
        }

        // Ignore system directories
        let path_str = path.to_string_lossy();
        if path_str.contains("node_modules") ||
           path_str.contains(".git") ||
           path_str.contains("target") ||
           path_str.contains("dist") ||
           path_str.contains("build") {
            return true;
        }

        false
    }

    pub async fn add_watch_path<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        let path = path.as_ref().to_path_buf();
        
        if !path.exists() {
            return Err(anyhow!("Path does not exist: {}", path.display()));
        }

        if self.watch_paths.contains(&path) {
            return Ok(());
        }

        self.watch_paths.push(path.clone());

        // If watcher is running, add the new path
        if *self.is_running.read().await {
            if let Some(watcher) = &self.watcher {
                if let Ok(mut w) = watcher.try_lock() {
                    w.watch(&path, RecursiveMode::Recursive)?;
                    info!("Added watch path: {}", path.display());
                }
            }
        }

        Ok(())
    }

    pub async fn remove_watch_path<P: AsRef<Path>>(&mut self, path: P) -> Result<()> {
        let path = path.as_ref().to_path_buf();
        
        if let Some(pos) = self.watch_paths.iter().position(|p| p == &path) {
            self.watch_paths.remove(pos);

            // If watcher is running, remove the path
            if *self.is_running.read().await {
                if let Some(watcher) = &self.watcher {
                    if let Ok(mut w) = watcher.try_lock() {
                        w.unwatch(&path)?;
                        info!("Removed watch path: {}", path.display());
                    }
                }
            }
        }

        Ok(())
    }
}

impl Drop for FileWatcher {
    fn drop(&mut self) {
        // Ensure watcher is stopped when dropped
        let is_running = Arc::clone(&self.is_running);
        tokio::spawn(async move {
            let mut running = is_running.write().await;
            *running = false;
        });
    }
}

// Utility functions for file system operations
pub struct FileSystemUtils;

impl FileSystemUtils {
    pub fn get_file_metadata(path: &Path) -> Result<serde_json::Value> {
        let metadata = std::fs::metadata(path)?;
        
        let modified = metadata.modified()?
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs();

        let created = metadata.created()
            .map(|time| time.duration_since(SystemTime::UNIX_EPOCH)
                .map(|dur| dur.as_secs())
                .unwrap_or(0))
            .unwrap_or(0);

        Ok(serde_json::json!({
            "size": metadata.len(),
            "modified": modified,
            "created": created,
            "is_file": metadata.is_file(),
            "is_dir": metadata.is_dir(),
            "readonly": metadata.permissions().readonly(),
        }))
    }

    pub fn is_text_file(path: &Path) -> bool {
        let extension = path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        matches!(extension.as_str(), 
            "txt" | "md" | "markdown" | "rst" | "adoc" | "asciidoc" |
            "html" | "htm" | "xml" | "json" | "yaml" | "yml" | "toml" |
            "csv" | "tsv" | "log" | "ini" | "cfg" | "conf" |
            "js" | "ts" | "jsx" | "tsx" | "css" | "scss" | "sass" |
            "py" | "rs" | "go" | "java" | "c" | "cpp" | "h" | "hpp" |
            "rb" | "php" | "pl" | "sh" | "bash" | "zsh" | "fish"
        )
    }

    pub fn calculate_file_hash(path: &Path) -> Result<String> {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let content = std::fs::read(path)?;
        let mut hasher = DefaultHasher::new();
        content.hash(&mut hasher);
        Ok(format!("{:x}", hasher.finish()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::time::{sleep, Duration};
    use tempfile::TempDir;

    struct TestCallback {
        event_count: Arc<AtomicUsize>,
    }

    impl TestCallback {
        fn new() -> (Self, Arc<AtomicUsize>) {
            let counter = Arc::new(AtomicUsize::new(0));
            (Self { event_count: counter.clone() }, counter)
        }
    }

    impl FileWatcherCallback for TestCallback {
        fn on_file_event(&self, _event: FileWatcherEvent) {
            self.event_count.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn test_file_watcher_creation() {
        let temp_dir = TempDir::new().unwrap();
        let (callback, _) = TestCallback::new();
        
        let watcher = FileWatcher::new(
            vec![temp_dir.path()],
            Arc::new(callback),
        );
        
        assert!(watcher.is_ok());
    }

    #[tokio::test]
    async fn test_file_watcher_start_stop() {
        let temp_dir = TempDir::new().unwrap();
        let (callback, _) = TestCallback::new();
        
        let mut watcher = FileWatcher::new(
            vec![temp_dir.path()],
            Arc::new(callback),
        ).unwrap();
        
        assert!(!watcher.is_running().await);
        
        watcher.start().await.unwrap();
        assert!(watcher.is_running().await);
        
        watcher.stop().await;
        assert!(!watcher.is_running().await);
    }

    #[tokio::test]
    async fn test_file_utils() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");
        
        std::fs::write(&test_file, "test content").unwrap();
        
        let metadata = FileSystemUtils::get_file_metadata(&test_file).unwrap();
        assert!(metadata["is_file"].as_bool().unwrap());
        assert!(!metadata["is_dir"].as_bool().unwrap());
        
        assert!(FileSystemUtils::is_text_file(&test_file));
        
        let hash = FileSystemUtils::calculate_file_hash(&test_file).unwrap();
        assert!(!hash.is_empty());
    }
}