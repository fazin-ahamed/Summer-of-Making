use std::path::Path;
use anyhow::{Result, anyhow};
use rocksdb::{DB, Options, ColumnFamily, ColumnFamilyDescriptor};
use serde::{Serialize, Deserialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphMetadata {
    pub entity_relationships: Vec<EntityRelationship>,
    pub relationship_weights: std::collections::HashMap<String, f64>,
    pub entity_centrality: std::collections::HashMap<String, f64>,
    pub graph_statistics: GraphStatistics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityRelationship {
    pub id: String,
    pub source_entity_id: String,
    pub target_entity_id: String,
    pub relationship_type: String,
    pub strength: f64,
    pub confidence: f64,
    pub created_at: DateTime<Utc>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphStatistics {
    pub total_entities: usize,
    pub total_relationships: usize,
    pub relationship_types: std::collections::HashMap<String, usize>,
    pub average_degree: f64,
    pub max_degree: usize,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityMetrics {
    pub entity_id: String,
    pub degree_centrality: f64,
    pub betweenness_centrality: f64,
    pub closeness_centrality: f64,
    pub pagerank_score: f64,
    pub cluster_coefficient: f64,
}

pub struct GraphDatabase {
    db: DB,
}

impl GraphDatabase {
    pub fn new<P: AsRef<Path>>(db_path: P) -> Result<Self> {
        let mut opts = Options::default();
        opts.create_if_missing(true);
        opts.create_missing_column_families(true);

        // Define column families
        let cf_descriptors = vec![
            ColumnFamilyDescriptor::new("entities", Options::default()),
            ColumnFamilyDescriptor::new("relationships", Options::default()),
            ColumnFamilyDescriptor::new("entity_metrics", Options::default()),
            ColumnFamilyDescriptor::new("graph_stats", Options::default()),
            ColumnFamilyDescriptor::new("temporal_data", Options::default()),
        ];

        let db = DB::open_cf_descriptors(&opts, db_path, cf_descriptors)
            .map_err(|e| anyhow!("Failed to open RocksDB: {}", e))?;

        Ok(Self { db })
    }

    pub fn store_relationship(&self, relationship: &EntityRelationship) -> Result<()> {
        let cf = self.get_cf("relationships")?;
        let key = relationship.id.as_bytes();
        let value = bincode::serialize(relationship)
            .map_err(|e| anyhow!("Failed to serialize relationship: {}", e))?;

        self.db.put_cf(&cf, key, value)
            .map_err(|e| anyhow!("Failed to store relationship: {}", e))?;

        // Also store reverse index for quick lookups
        self.store_relationship_indexes(relationship)?;

        Ok(())
    }

    fn store_relationship_indexes(&self, relationship: &EntityRelationship) -> Result<()> {
        let cf = self.get_cf("relationships")?;

        // Index by source entity
        let source_key = format!("source:{}", relationship.source_entity_id);
        let mut source_relationships = self.get_entity_relationships(&relationship.source_entity_id)?;
        source_relationships.push(relationship.id.clone());
        let source_value = bincode::serialize(&source_relationships)?;
        self.db.put_cf(&cf, source_key.as_bytes(), source_value)?;

        // Index by target entity
        let target_key = format!("target:{}", relationship.target_entity_id);
        let mut target_relationships = self.get_entity_relationships(&relationship.target_entity_id)?;
        target_relationships.push(relationship.id.clone());
        let target_value = bincode::serialize(&target_relationships)?;
        self.db.put_cf(&cf, target_key.as_bytes(), target_value)?;

        // Index by relationship type
        let type_key = format!("type:{}", relationship.relationship_type);
        let mut type_relationships = self.get_relationships_by_type(&relationship.relationship_type)?;
        type_relationships.push(relationship.id.clone());
        let type_value = bincode::serialize(&type_relationships)?;
        self.db.put_cf(&cf, type_key.as_bytes(), type_value)?;

        Ok(())
    }

    pub fn get_relationship(&self, relationship_id: &str) -> Result<Option<EntityRelationship>> {
        let cf = self.get_cf("relationships")?;
        let key = relationship_id.as_bytes();

        match self.db.get_cf(&cf, key)? {
            Some(value) => {
                let relationship = bincode::deserialize(&value)
                    .map_err(|e| anyhow!("Failed to deserialize relationship: {}", e))?;
                Ok(Some(relationship))
            }
            None => Ok(None),
        }
    }

    pub fn get_entity_relationships(&self, entity_id: &str) -> Result<Vec<String>> {
        let cf = self.get_cf("relationships")?;
        let source_key = format!("source:{}", entity_id);
        let target_key = format!("target:{}", entity_id);

        let mut relationships = Vec::new();

        // Get relationships where entity is source
        if let Some(source_value) = self.db.get_cf(&cf, source_key.as_bytes())? {
            let source_rels: Vec<String> = bincode::deserialize(&source_value)?;
            relationships.extend(source_rels);
        }

        // Get relationships where entity is target
        if let Some(target_value) = self.db.get_cf(&cf, target_key.as_bytes())? {
            let target_rels: Vec<String> = bincode::deserialize(&target_value)?;
            relationships.extend(target_rels);
        }

        // Remove duplicates
        relationships.sort();
        relationships.dedup();

        Ok(relationships)
    }

    pub fn get_relationships_by_type(&self, relationship_type: &str) -> Result<Vec<String>> {
        let cf = self.get_cf("relationships")?;
        let type_key = format!("type:{}", relationship_type);

        match self.db.get_cf(&cf, type_key.as_bytes())? {
            Some(value) => {
                let relationships = bincode::deserialize(&value)?;
                Ok(relationships)
            }
            None => Ok(Vec::new()),
        }
    }

    pub fn store_entity_metrics(&self, metrics: &EntityMetrics) -> Result<()> {
        let cf = self.get_cf("entity_metrics")?;
        let key = metrics.entity_id.as_bytes();
        let value = bincode::serialize(metrics)
            .map_err(|e| anyhow!("Failed to serialize entity metrics: {}", e))?;

        self.db.put_cf(&cf, key, value)
            .map_err(|e| anyhow!("Failed to store entity metrics: {}", e))?;

        Ok(())
    }

    pub fn get_entity_metrics(&self, entity_id: &str) -> Result<Option<EntityMetrics>> {
        let cf = self.get_cf("entity_metrics")?;
        let key = entity_id.as_bytes();

        match self.db.get_cf(&cf, key)? {
            Some(value) => {
                let metrics = bincode::deserialize(&value)
                    .map_err(|e| anyhow!("Failed to deserialize entity metrics: {}", e))?;
                Ok(Some(metrics))
            }
            None => Ok(None),
        }
    }

    pub fn store_graph_statistics(&self, stats: &GraphStatistics) -> Result<()> {
        let cf = self.get_cf("graph_stats")?;
        let key = b"current_stats";
        let value = bincode::serialize(stats)
            .map_err(|e| anyhow!("Failed to serialize graph statistics: {}", e))?;

        self.db.put_cf(&cf, key, value)
            .map_err(|e| anyhow!("Failed to store graph statistics: {}", e))?;

        Ok(())
    }

    pub fn get_graph_statistics(&self) -> Result<Option<GraphStatistics>> {
        let cf = self.get_cf("graph_stats")?;
        let key = b"current_stats";

        match self.db.get_cf(&cf, key)? {
            Some(value) => {
                let stats = bincode::deserialize(&value)
                    .map_err(|e| anyhow!("Failed to deserialize graph statistics: {}", e))?;
                Ok(Some(stats))
            }
            None => Ok(None),
        }
    }

    pub fn delete_relationship(&self, relationship_id: &str) -> Result<()> {
        // First get the relationship to clean up indexes
        if let Some(relationship) = self.get_relationship(relationship_id)? {
            self.remove_relationship_indexes(&relationship)?;
        }

        let cf = self.get_cf("relationships")?;
        let key = relationship_id.as_bytes();
        
        self.db.delete_cf(&cf, key)
            .map_err(|e| anyhow!("Failed to delete relationship: {}", e))?;

        Ok(())
    }

    fn remove_relationship_indexes(&self, relationship: &EntityRelationship) -> Result<()> {
        let cf = self.get_cf("relationships")?;

        // Remove from source entity index
        let source_key = format!("source:{}", relationship.source_entity_id);
        let mut source_relationships = self.get_entity_relationships(&relationship.source_entity_id)?;
        source_relationships.retain(|id| id != &relationship.id);
        let source_value = bincode::serialize(&source_relationships)?;
        self.db.put_cf(&cf, source_key.as_bytes(), source_value)?;

        // Remove from target entity index
        let target_key = format!("target:{}", relationship.target_entity_id);
        let mut target_relationships = self.get_entity_relationships(&relationship.target_entity_id)?;
        target_relationships.retain(|id| id != &relationship.id);
        let target_value = bincode::serialize(&target_relationships)?;
        self.db.put_cf(&cf, target_key.as_bytes(), target_value)?;

        // Remove from type index
        let type_key = format!("type:{}", relationship.relationship_type);
        let mut type_relationships = self.get_relationships_by_type(&relationship.relationship_type)?;
        type_relationships.retain(|id| id != &relationship.id);
        let type_value = bincode::serialize(&type_relationships)?;
        self.db.put_cf(&cf, type_key.as_bytes(), type_value)?;

        Ok(())
    }

    pub fn get_connected_entities(&self, entity_id: &str, max_depth: usize) -> Result<Vec<String>> {
        let mut visited = std::collections::HashSet::new();
        let mut queue = std::collections::VecDeque::new();
        let mut result = Vec::new();

        queue.push_back((entity_id.to_string(), 0));
        visited.insert(entity_id.to_string());

        while let Some((current_entity, depth)) = queue.pop_front() {
            if depth > max_depth {
                continue;
            }

            if depth > 0 {
                result.push(current_entity.clone());
            }

            let relationship_ids = self.get_entity_relationships(&current_entity)?;
            for rel_id in relationship_ids {
                if let Some(relationship) = self.get_relationship(&rel_id)? {
                    let connected_entity = if relationship.source_entity_id == current_entity {
                        &relationship.target_entity_id
                    } else {
                        &relationship.source_entity_id
                    };

                    if !visited.contains(connected_entity) {
                        visited.insert(connected_entity.clone());
                        queue.push_back((connected_entity.clone(), depth + 1));
                    }
                }
            }
        }

        Ok(result)
    }

    pub fn find_shortest_path(&self, source: &str, target: &str) -> Result<Option<Vec<String>>> {
        let mut queue = std::collections::VecDeque::new();
        let mut visited = std::collections::HashSet::new();
        let mut parent = std::collections::HashMap::new();

        queue.push_back(source.to_string());
        visited.insert(source.to_string());

        while let Some(current) = queue.pop_front() {
            if current == target {
                // Reconstruct path
                let mut path = Vec::new();
                let mut node = target.to_string();
                
                while node != source {
                    path.push(node.clone());
                    node = parent[&node].clone();
                }
                path.push(source.to_string());
                path.reverse();
                
                return Ok(Some(path));
            }

            let relationship_ids = self.get_entity_relationships(&current)?;
            for rel_id in relationship_ids {
                if let Some(relationship) = self.get_relationship(&rel_id)? {
                    let neighbor = if relationship.source_entity_id == current {
                        &relationship.target_entity_id
                    } else {
                        &relationship.source_entity_id
                    };

                    if !visited.contains(neighbor) {
                        visited.insert(neighbor.clone());
                        parent.insert(neighbor.clone(), current.clone());
                        queue.push_back(neighbor.clone());
                    }
                }
            }
        }

        Ok(None)
    }

    pub fn calculate_graph_statistics(&self) -> Result<GraphStatistics> {
        let mut total_entities = std::collections::HashSet::new();
        let mut total_relationships = 0;
        let mut relationship_types = std::collections::HashMap::new();
        let mut entity_degrees = std::collections::HashMap::new();

        // Iterate through all relationships
        let cf = self.get_cf("relationships")?;
        let iter = self.db.iterator_cf(&cf, rocksdb::IteratorMode::Start);

        for item in iter {
            let (key, value) = item?;
            let key_str = String::from_utf8_lossy(&key);
            
            // Skip index entries
            if key_str.starts_with("source:") || key_str.starts_with("target:") || key_str.starts_with("type:") {
                continue;
            }

            if let Ok(relationship) = bincode::deserialize::<EntityRelationship>(&value) {
                total_entities.insert(relationship.source_entity_id.clone());
                total_entities.insert(relationship.target_entity_id.clone());
                total_relationships += 1;

                *relationship_types.entry(relationship.relationship_type).or_insert(0) += 1;
                *entity_degrees.entry(relationship.source_entity_id).or_insert(0) += 1;
                *entity_degrees.entry(relationship.target_entity_id).or_insert(0) += 1;
            }
        }

        let total_entity_count = total_entities.len();
        let average_degree = if total_entity_count > 0 {
            (total_relationships * 2) as f64 / total_entity_count as f64
        } else {
            0.0
        };

        let max_degree = entity_degrees.values().max().copied().unwrap_or(0);

        Ok(GraphStatistics {
            total_entities: total_entity_count,
            total_relationships,
            relationship_types,
            average_degree,
            max_degree,
            last_updated: Utc::now(),
        })
    }

    pub fn get_most_connected_entities(&self, limit: usize) -> Result<Vec<(String, usize)>> {
        let mut entity_degrees = std::collections::HashMap::new();

        let cf = self.get_cf("relationships")?;
        let iter = self.db.iterator_cf(&cf, rocksdb::IteratorMode::Start);

        for item in iter {
            let (key, value) = item?;
            let key_str = String::from_utf8_lossy(&key);
            
            if key_str.starts_with("source:") || key_str.starts_with("target:") || key_str.starts_with("type:") {
                continue;
            }

            if let Ok(relationship) = bincode::deserialize::<EntityRelationship>(&value) {
                *entity_degrees.entry(relationship.source_entity_id).or_insert(0) += 1;
                *entity_degrees.entry(relationship.target_entity_id).or_insert(0) += 1;
            }
        }

        let mut sorted_entities: Vec<_> = entity_degrees.into_iter().collect();
        sorted_entities.sort_by(|a, b| b.1.cmp(&a.1));
        sorted_entities.truncate(limit);

        Ok(sorted_entities)
    }

    fn get_cf(&self, name: &str) -> Result<ColumnFamily> {
        self.db.cf_handle(name)
            .ok_or_else(|| anyhow!("Column family '{}' not found", name))
    }

    pub fn compact(&self) -> Result<()> {
        self.db.compact_range(None::<&[u8]>, None::<&[u8]>);
        Ok(())
    }

    pub fn backup<P: AsRef<Path>>(&self, backup_path: P) -> Result<()> {
        // TODO: Implement backup functionality
        // This would typically use RocksDB's backup engine
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_relationship() -> EntityRelationship {
        EntityRelationship {
            id: Uuid::new_v4().to_string(),
            source_entity_id: "entity1".to_string(),
            target_entity_id: "entity2".to_string(),
            relationship_type: "knows".to_string(),
            strength: 0.8,
            confidence: 0.9,
            created_at: Utc::now(),
            metadata: serde_json::json!({"test": "value"}),
        }
    }

    #[test]
    fn test_graph_database_creation() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_graph.db");
        
        let db = GraphDatabase::new(db_path);
        assert!(db.is_ok());
    }

    #[test]
    fn test_relationship_storage_and_retrieval() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_graph.db");
        let db = GraphDatabase::new(db_path).unwrap();

        let relationship = create_test_relationship();
        let relationship_id = relationship.id.clone();

        // Store relationship
        assert!(db.store_relationship(&relationship).is_ok());

        // Retrieve relationship
        let retrieved = db.get_relationship(&relationship_id).unwrap();
        assert!(retrieved.is_some());
        
        let retrieved_rel = retrieved.unwrap();
        assert_eq!(retrieved_rel.id, relationship_id);
        assert_eq!(retrieved_rel.source_entity_id, "entity1");
        assert_eq!(retrieved_rel.target_entity_id, "entity2");
    }

    #[test]
    fn test_entity_relationships_lookup() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_graph.db");
        let db = GraphDatabase::new(db_path).unwrap();

        let relationship = create_test_relationship();
        db.store_relationship(&relationship).unwrap();

        // Get relationships for entity1
        let entity1_rels = db.get_entity_relationships("entity1").unwrap();
        assert!(!entity1_rels.is_empty());
        assert!(entity1_rels.contains(&relationship.id));

        // Get relationships for entity2
        let entity2_rels = db.get_entity_relationships("entity2").unwrap();
        assert!(!entity2_rels.is_empty());
        assert!(entity2_rels.contains(&relationship.id));
    }

    #[test]
    fn test_relationship_deletion() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_graph.db");
        let db = GraphDatabase::new(db_path).unwrap();

        let relationship = create_test_relationship();
        let relationship_id = relationship.id.clone();

        // Store and then delete
        db.store_relationship(&relationship).unwrap();
        assert!(db.get_relationship(&relationship_id).unwrap().is_some());

        db.delete_relationship(&relationship_id).unwrap();
        assert!(db.get_relationship(&relationship_id).unwrap().is_none());
    }

    #[test]
    fn test_connected_entities() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_graph.db");
        let db = GraphDatabase::new(db_path).unwrap();

        // Create a chain: entity1 -> entity2 -> entity3
        let rel1 = EntityRelationship {
            id: Uuid::new_v4().to_string(),
            source_entity_id: "entity1".to_string(),
            target_entity_id: "entity2".to_string(),
            relationship_type: "connects".to_string(),
            strength: 1.0,
            confidence: 1.0,
            created_at: Utc::now(),
            metadata: serde_json::json!({}),
        };

        let rel2 = EntityRelationship {
            id: Uuid::new_v4().to_string(),
            source_entity_id: "entity2".to_string(),
            target_entity_id: "entity3".to_string(),
            relationship_type: "connects".to_string(),
            strength: 1.0,
            confidence: 1.0,
            created_at: Utc::now(),
            metadata: serde_json::json!({}),
        };

        db.store_relationship(&rel1).unwrap();
        db.store_relationship(&rel2).unwrap();

        // Find connected entities from entity1 with depth 2
        let connected = db.get_connected_entities("entity1", 2).unwrap();
        assert!(connected.contains(&"entity2".to_string()));
        assert!(connected.contains(&"entity3".to_string()));
    }

    #[test]
    fn test_graph_statistics() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_graph.db");
        let db = GraphDatabase::new(db_path).unwrap();

        let relationship = create_test_relationship();
        db.store_relationship(&relationship).unwrap();

        let stats = db.calculate_graph_statistics().unwrap();
        assert_eq!(stats.total_entities, 2);
        assert_eq!(stats.total_relationships, 1);
        assert!(stats.relationship_types.contains_key("knows"));
    }
}