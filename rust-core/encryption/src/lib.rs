use anyhow::{Result, anyhow};
use serde::{Serialize, Deserialize};
use sodiumoxide::crypto::{secretbox, pwhash};
use base64::{Engine as _, engine::general_purpose};
use rand::Rng;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptionConfig {
    pub enabled: bool,
    pub algorithm: String,
    pub key_derivation: String,
}

impl Default for EncryptionConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            algorithm: "XSalsa20Poly1305".to_string(),
            key_derivation: "Argon2i".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct EncryptionKey {
    key: secretbox::Key,
}

impl EncryptionKey {
    pub fn from_password(password: &str, salt: &[u8]) -> Result<Self> {
        if salt.len() != pwhash::SALTBYTES {
            return Err(anyhow!("Invalid salt length"));
        }

        let mut key = [0u8; secretbox::KEYBYTES];
        let salt = pwhash::Salt::from_slice(salt)
            .ok_or_else(|| anyhow!("Failed to create salt"))?;

        pwhash::derive_key(
            &mut key,
            password.as_bytes(),
            &salt,
            pwhash::OPSLIMIT_INTERACTIVE,
            pwhash::MEMLIMIT_INTERACTIVE,
        ).map_err(|_| anyhow!("Key derivation failed"))?;

        let secretbox_key = secretbox::Key::from_slice(&key)
            .ok_or_else(|| anyhow!("Failed to create encryption key"))?;

        Ok(Self { key: secretbox_key })
    }

    pub fn generate() -> Self {
        Self {
            key: secretbox::gen_key(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedData {
    pub ciphertext: String,
    pub nonce: String,
    pub salt: Option<String>,
}

pub struct EncryptionEngine {
    config: EncryptionConfig,
    master_key: Option<EncryptionKey>,
}

impl EncryptionEngine {
    pub fn new(config: EncryptionConfig) -> Result<Self> {
        // Initialize sodiumoxide
        sodiumoxide::init().map_err(|_| anyhow!("Failed to initialize sodiumoxide"))?;

        Ok(Self {
            config,
            master_key: None,
        })
    }

    pub fn set_master_key(&mut self, key: EncryptionKey) {
        self.master_key = Some(key);
    }

    pub fn set_master_password(&mut self, password: &str) -> Result<Vec<u8>> {
        let salt = self.generate_salt();
        let key = EncryptionKey::from_password(password, &salt)?;
        self.master_key = Some(key);
        Ok(salt)
    }

    pub fn encrypt(&self, plaintext: &[u8]) -> Result<EncryptedData> {
        if !self.config.enabled {
            return Err(anyhow!("Encryption is disabled"));
        }

        let key = self.master_key.as_ref()
            .ok_or_else(|| anyhow!("No encryption key set"))?;

        let nonce = secretbox::gen_nonce();
        let ciphertext = secretbox::seal(plaintext, &nonce, &key.key);

        Ok(EncryptedData {
            ciphertext: general_purpose::STANDARD.encode(&ciphertext),
            nonce: general_purpose::STANDARD.encode(&nonce.0),
            salt: None,
        })
    }

    pub fn decrypt(&self, encrypted_data: &EncryptedData) -> Result<Vec<u8>> {
        if !self.config.enabled {
            return Err(anyhow!("Encryption is disabled"));
        }

        let key = self.master_key.as_ref()
            .ok_or_else(|| anyhow!("No encryption key set"))?;

        let ciphertext = general_purpose::STANDARD.decode(&encrypted_data.ciphertext)
            .map_err(|e| anyhow!("Failed to decode ciphertext: {}", e))?;

        let nonce_bytes = general_purpose::STANDARD.decode(&encrypted_data.nonce)
            .map_err(|e| anyhow!("Failed to decode nonce: {}", e))?;

        if nonce_bytes.len() != secretbox::NONCEBYTES {
            return Err(anyhow!("Invalid nonce length"));
        }

        let nonce = secretbox::Nonce::from_slice(&nonce_bytes)
            .ok_or_else(|| anyhow!("Failed to create nonce"))?;

        let plaintext = secretbox::open(&ciphertext, &nonce, &key.key)
            .map_err(|_| anyhow!("Decryption failed"))?;

        Ok(plaintext)
    }

    pub fn encrypt_string(&self, plaintext: &str) -> Result<EncryptedData> {
        self.encrypt(plaintext.as_bytes())
    }

    pub fn decrypt_string(&self, encrypted_data: &EncryptedData) -> Result<String> {
        let plaintext = self.decrypt(encrypted_data)?;
        String::from_utf8(plaintext)
            .map_err(|e| anyhow!("Failed to convert decrypted data to string: {}", e))
    }

    pub fn encrypt_json<T: Serialize>(&self, data: &T) -> Result<EncryptedData> {
        let json = serde_json::to_string(data)
            .map_err(|e| anyhow!("Failed to serialize data: {}", e))?;
        self.encrypt_string(&json)
    }

    pub fn decrypt_json<T: for<'de> Deserialize<'de>>(&self, encrypted_data: &EncryptedData) -> Result<T> {
        let json = self.decrypt_string(encrypted_data)?;
        serde_json::from_str(&json)
            .map_err(|e| anyhow!("Failed to deserialize data: {}", e))
    }

    pub fn generate_salt(&self) -> Vec<u8> {
        let mut salt = vec![0u8; pwhash::SALTBYTES];
        rand::thread_rng().fill(&mut salt[..]);
        salt
    }

    pub fn hash_password(&self, password: &str, salt: &[u8]) -> Result<String> {
        if salt.len() != pwhash::SALTBYTES {
            return Err(anyhow!("Invalid salt length"));
        }

        let salt = pwhash::Salt::from_slice(salt)
            .ok_or_else(|| anyhow!("Failed to create salt"))?;

        let hash = pwhash::pwhash(
            password.as_bytes(),
            pwhash::OPSLIMIT_INTERACTIVE,
            pwhash::MEMLIMIT_INTERACTIVE,
            &salt,
        ).map_err(|_| anyhow!("Password hashing failed"))?;

        Ok(general_purpose::STANDARD.encode(&hash))
    }

    pub fn verify_password(&self, password: &str, hash: &str, salt: &[u8]) -> Result<bool> {
        let expected_hash = self.hash_password(password, salt)?;
        Ok(expected_hash == hash)
    }

    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    pub fn get_config(&self) -> &EncryptionConfig {
        &self.config
    }

    pub fn update_config(&mut self, config: EncryptionConfig) -> Result<()> {
        // If encryption is being disabled, clear the master key
        if !config.enabled && self.config.enabled {
            self.master_key = None;
        }

        self.config = config;
        Ok(())
    }
}

// Utility functions for working with encrypted data
pub struct EncryptionUtils;

impl EncryptionUtils {
    pub fn generate_secure_token(length: usize) -> String {
        let mut token = vec![0u8; length];
        rand::thread_rng().fill(&mut token[..]);
        general_purpose::STANDARD.encode(&token)
    }

    pub fn constant_time_compare(a: &[u8], b: &[u8]) -> bool {
        if a.len() != b.len() {
            return false;
        }

        let mut result = 0u8;
        for (x, y) in a.iter().zip(b.iter()) {
            result |= x ^ y;
        }
        result == 0
    }

    pub fn secure_random_bytes(length: usize) -> Vec<u8> {
        let mut bytes = vec![0u8; length];
        rand::thread_rng().fill(&mut bytes[..]);
        bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encryption_engine_creation() {
        let config = EncryptionConfig::default();
        let engine = EncryptionEngine::new(config);
        assert!(engine.is_ok());
    }

    #[test]
    fn test_key_derivation() {
        let password = "test_password";
        let salt = vec![1u8; pwhash::SALTBYTES];
        
        let key = EncryptionKey::from_password(password, &salt);
        assert!(key.is_ok());
    }

    #[test]
    fn test_encryption_decryption() {
        let mut config = EncryptionConfig::default();
        config.enabled = true;
        
        let mut engine = EncryptionEngine::new(config).unwrap();
        let key = EncryptionKey::generate();
        engine.set_master_key(key);

        let plaintext = "Hello, World!";
        let encrypted = engine.encrypt_string(plaintext).unwrap();
        let decrypted = engine.decrypt_string(&encrypted).unwrap();

        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_json_encryption() {
        #[derive(Serialize, Deserialize, PartialEq, Debug)]
        struct TestData {
            name: String,
            age: u32,
        }

        let mut config = EncryptionConfig::default();
        config.enabled = true;
        
        let mut engine = EncryptionEngine::new(config).unwrap();
        let key = EncryptionKey::generate();
        engine.set_master_key(key);

        let data = TestData {
            name: "Alice".to_string(),
            age: 30,
        };

        let encrypted = engine.encrypt_json(&data).unwrap();
        let decrypted: TestData = engine.decrypt_json(&encrypted).unwrap();

        assert_eq!(data, decrypted);
    }

    #[test]
    fn test_password_hashing() {
        let config = EncryptionConfig::default();
        let engine = EncryptionEngine::new(config).unwrap();

        let password = "test_password";
        let salt = engine.generate_salt();
        
        let hash = engine.hash_password(password, &salt).unwrap();
        assert!(engine.verify_password(password, &hash, &salt).unwrap());
        assert!(!engine.verify_password("wrong_password", &hash, &salt).unwrap());
    }

    #[test]
    fn test_encryption_utils() {
        let token = EncryptionUtils::generate_secure_token(32);
        assert!(!token.is_empty());

        let bytes1 = b"hello";
        let bytes2 = b"hello";
        let bytes3 = b"world";

        assert!(EncryptionUtils::constant_time_compare(bytes1, bytes2));
        assert!(!EncryptionUtils::constant_time_compare(bytes1, bytes3));

        let random_bytes = EncryptionUtils::secure_random_bytes(16);
        assert_eq!(random_bytes.len(), 16);
    }
}