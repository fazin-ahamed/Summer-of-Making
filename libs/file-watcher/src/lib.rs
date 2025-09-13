use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    pub path: String,
    pub event_type: FileEventType,
    pub timestamp: u64,
    pub metadata: Option<FileMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileEventType {
    Created,
    Modified,
    Deleted,
    Renamed { old_path: String },
    Moved { from: String, to: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub size: u64,
    pub modified_time: u64,
    pub file_type: String,
    pub permissions: u32,
}

#[derive(Debug)]
pub struct FileWatcher {
    watcher: Option<RecommendedWatcher>,
    receiver: Option<Receiver<Result<Event, notify::Error>>>,
    event_sender: Option<Sender<FileChangeEvent>>,
    watched_paths: HashMap<String, bool>,
}

pub type FileEventCallback = Box<dyn Fn(FileChangeEvent) + Send + Sync>;

impl FileWatcher {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(FileWatcher {
            watcher: None,
            receiver: None,
            event_sender: None,
            watched_paths: HashMap::new(),
        })
    }

    pub fn start_watching(&mut self, callback: FileEventCallback) -> Result<(), Box<dyn std::error::Error>> {
        let (tx, rx) = mpsc::channel();
        let (event_tx, event_rx) = mpsc::channel::<FileChangeEvent>();
        
        let watcher = RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default(),
        )?;

        self.watcher = Some(watcher);
        self.receiver = Some(rx);
        self.event_sender = Some(event_tx);

        // Start event processing thread
        thread::spawn(move || {
            while let Ok(event) = event_rx.recv() {
                callback(event);
            }
        });

        // Start file system event processing thread
        let receiver = self.receiver.take().unwrap();
        let sender = self.event_sender.as_ref().unwrap().clone();
        
        thread::spawn(move || {
            loop {
                match receiver.recv_timeout(Duration::from_millis(100)) {
                    Ok(Ok(event)) => {
                        if let Some(file_event) = Self::process_fs_event(event) {
                            let _ = sender.send(file_event);
                        }
                    }
                    Ok(Err(e)) => {
                        eprintln!("File watcher error: {:?}", e);
                    }
                    Err(_) => {
                        // Timeout, continue loop
                        continue;
                    }
                }
            }
        });

        Ok(())
    }

    pub fn watch_path<P: AsRef<Path>>(&mut self, path: P, recursive: bool) -> Result<(), Box<dyn std::error::Error>> {
        let path_str = path.as_ref().to_string_lossy().to_string();
        
        if let Some(ref mut watcher) = self.watcher {
            let mode = if recursive {
                RecursiveMode::Recursive
            } else {
                RecursiveMode::NonRecursive
            };
            
            watcher.watch(path.as_ref(), mode)?;
            self.watched_paths.insert(path_str, recursive);
        }

        Ok(())
    }

    pub fn unwatch_path<P: AsRef<Path>>(&mut self, path: P) -> Result<(), Box<dyn std::error::Error>> {
        let path_str = path.as_ref().to_string_lossy().to_string();
        
        if let Some(ref mut watcher) = self.watcher {
            watcher.unwatch(path.as_ref())?;
            self.watched_paths.remove(&path_str);
        }

        Ok(())
    }

    pub fn get_watched_paths(&self) -> Vec<String> {
        self.watched_paths.keys().cloned().collect()
    }

    fn process_fs_event(event: Event) -> Option<FileChangeEvent> {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let path = event.paths.first()?.to_string_lossy().to_string();
        
        let event_type = match event.kind {
            EventKind::Create(_) => FileEventType::Created,
            EventKind::Modify(_) => FileEventType::Modified,
            EventKind::Remove(_) => FileEventType::Deleted,
            EventKind::Other => return None,
            _ => return None,
        };

        let metadata = Self::get_file_metadata(&path);

        Some(FileChangeEvent {
            path,
            event_type,
            timestamp,
            metadata,
        })
    }

    fn get_file_metadata(path: &str) -> Option<FileMetadata> {
        let metadata = std::fs::metadata(path).ok()?;
        
        let file_type = if metadata.is_dir() {
            "directory".to_string()
        } else if metadata.is_file() {
            // Extract file extension
            Path::new(path)
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("unknown")
                .to_string()
        } else {
            "other".to_string()
        };

        let modified_time = metadata
            .modified()
            .ok()?
            .duration_since(std::time::UNIX_EPOCH)
            .ok()?
            .as_secs();

        Some(FileMetadata {
            size: metadata.len(),
            modified_time,
            file_type,
            permissions: 0o644, // Default permissions, platform-specific implementation needed
        })
    }

    pub fn stop(&mut self) {
        self.watcher = None;
        self.receiver = None;
        self.event_sender = None;
        self.watched_paths.clear();
    }
}

impl Drop for FileWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}

// FFI exports for JavaScript integration
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_void};
use std::sync::{Arc, Mutex};

static mut WATCHER_INSTANCE: Option<Arc<Mutex<FileWatcher>>> = None;

#[no_mangle]
pub extern "C" fn create_file_watcher() -> *mut c_void {
    match FileWatcher::new() {
        Ok(watcher) => {
            let watcher_arc = Arc::new(Mutex::new(watcher));
            unsafe {
                WATCHER_INSTANCE = Some(watcher_arc.clone());
            }
            Arc::into_raw(watcher_arc) as *mut c_void
        }
        Err(_) => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn watch_path(
    watcher_ptr: *mut c_void,
    path: *const c_char,
    recursive: bool,
) -> bool {
    if watcher_ptr.is_null() || path.is_null() {
        return false;
    }

    unsafe {
        let path_str = match CStr::from_ptr(path).to_str() {
            Ok(s) => s,
            Err(_) => return false,
        };

        if let Some(ref watcher_arc) = WATCHER_INSTANCE {
            if let Ok(mut watcher) = watcher_arc.lock() {
                watcher.watch_path(path_str, recursive).is_ok()
            } else {
                false
            }
        } else {
            false
        }
    }
}

#[no_mangle]
pub extern "C" fn start_watching(
    watcher_ptr: *mut c_void,
    callback: extern "C" fn(*const c_char),
) -> bool {
    if watcher_ptr.is_null() {
        return false;
    }

    unsafe {
        if let Some(ref watcher_arc) = WATCHER_INSTANCE {
            if let Ok(mut watcher) = watcher_arc.lock() {
                let callback_fn: FileEventCallback = Box::new(move |event| {
                    if let Ok(json) = serde_json::to_string(&event) {
                        if let Ok(c_str) = CString::new(json) {
                            callback(c_str.as_ptr());
                        }
                    }
                });

                watcher.start_watching(callback_fn).is_ok()
            } else {
                false
            }
        } else {
            false
        }
    }
}

#[no_mangle]
pub extern "C" fn destroy_file_watcher(watcher_ptr: *mut c_void) {
    if !watcher_ptr.is_null() {
        unsafe {
            let _ = Arc::from_raw(watcher_ptr as *const Mutex<FileWatcher>);
            WATCHER_INSTANCE = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;
    use tempfile::TempDir;

    #[test]
    fn test_file_watcher_creation() {
        let watcher = FileWatcher::new();
        assert!(watcher.is_ok());
    }

    #[test]
    fn test_watch_path() {
        let mut watcher = FileWatcher::new().unwrap();
        let temp_dir = TempDir::new().unwrap();
        
        let result = watcher.watch_path(temp_dir.path(), false);
        assert!(result.is_ok());
        
        let watched_paths = watcher.get_watched_paths();
        assert_eq!(watched_paths.len(), 1);
    }

    #[test]
    fn test_file_event_processing() {
        let temp_dir = TempDir::new().unwrap();
        let mut watcher = FileWatcher::new().unwrap();
        
        let (tx, rx) = mpsc::channel();
        let callback: FileEventCallback = Box::new(move |event| {
            let _ = tx.send(event);
        });

        watcher.start_watching(callback).unwrap();
        watcher.watch_path(temp_dir.path(), true).unwrap();

        // Create a test file
        let test_file = temp_dir.path().join("test.txt");
        std::fs::write(&test_file, "test content").unwrap();

        // Wait for event
        let event = rx.recv_timeout(Duration::from_secs(2));
        assert!(event.is_ok());

        let file_event = event.unwrap();
        assert!(file_event.path.contains("test.txt"));
        assert!(matches!(file_event.event_type, FileEventType::Created));
    }

    #[test]
    fn test_unwatch_path() {
        let mut watcher = FileWatcher::new().unwrap();
        let temp_dir = TempDir::new().unwrap();
        
        watcher.watch_path(temp_dir.path(), false).unwrap();
        assert_eq!(watcher.get_watched_paths().len(), 1);
        
        watcher.unwatch_path(temp_dir.path()).unwrap();
        assert_eq!(watcher.get_watched_paths().len(), 0);
    }

    #[test]
    fn test_file_metadata_extraction() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");
        std::fs::write(&test_file, "test content").unwrap();

        let metadata = FileWatcher::get_file_metadata(&test_file.to_string_lossy());
        assert!(metadata.is_some());

        let meta = metadata.unwrap();
        assert_eq!(meta.size, 12); // "test content" length
        assert_eq!(meta.file_type, "txt");
        assert!(meta.modified_time > 0);
    }

    #[test] 
    fn test_ffi_integration() {
        let watcher_ptr = create_file_watcher();
        assert!(!watcher_ptr.is_null());

        let temp_dir = TempDir::new().unwrap();
        let path_cstring = CString::new(temp_dir.path().to_string_lossy().as_ref()).unwrap();
        
        let result = watch_path(watcher_ptr, path_cstring.as_ptr(), false);
        assert!(result);

        destroy_file_watcher(watcher_ptr);
    }
}