use libsodium_sys::*;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_uchar, c_ulonglong};
use std::ptr;
use serde::{Deserialize, Serialize};

const MASTER_KEY_SIZE: usize = 32;
const NONCE_SIZE: usize = 24;
const SALT_SIZE: usize = 32;
const TAG_SIZE: usize = 16;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptionResult {
    pub ciphertext: Vec<u8>,
    pub nonce: Vec<u8>,
    pub salt: Vec<u8>,
    pub tag: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecryptionResult {
    pub plaintext: Vec<u8>,
    pub verified: bool,
}

#[derive(Debug)]
pub struct EncryptionEngine {
    master_key: Option<[u8; MASTER_KEY_SIZE]>,
    initialized: bool,
}

impl EncryptionEngine {
    pub fn new() -> Result<Self, String> {
        unsafe {
            if sodium_init() < 0 {
                return Err("Failed to initialize libsodium".to_string());
            }
        }

        Ok(EncryptionEngine {
            master_key: None,
            initialized: true,
        })
    }

    pub fn initialize_with_password(&mut self, password: &str, salt: Option<&[u8]>) -> Result<(), String> {
        if !self.initialized {
            return Err("Encryption engine not initialized".to_string());
        }

        let salt_bytes = match salt {
            Some(s) => {
                if s.len() != SALT_SIZE {
                    return Err(format!("Salt must be exactly {} bytes", SALT_SIZE));
                }
                s.to_vec()
            }
            None => self.generate_salt()?,
        };

        let mut key = [0u8; MASTER_KEY_SIZE];
        
        unsafe {
            let result = crypto_pwhash(
                key.as_mut_ptr(),
                MASTER_KEY_SIZE as c_ulonglong,
                password.as_ptr() as *const c_char,
                password.len() as c_ulonglong,
                salt_bytes.as_ptr(),
                crypto_pwhash_OPSLIMIT_INTERACTIVE as c_ulonglong,
                crypto_pwhash_MEMLIMIT_INTERACTIVE,
                crypto_pwhash_ALG_DEFAULT as c_int,
            );

            if result != 0 {
                return Err("Failed to derive key from password".to_string());
            }
        }

        self.master_key = Some(key);
        Ok(())
    }

    pub fn generate_key(&mut self) -> Result<[u8; MASTER_KEY_SIZE], String> {
        if !self.initialized {
            return Err("Encryption engine not initialized".to_string());
        }

        let mut key = [0u8; MASTER_KEY_SIZE];
        
        unsafe {
            randombytes_buf(key.as_mut_ptr() as *mut std::ffi::c_void, MASTER_KEY_SIZE);
        }

        self.master_key = Some(key);
        Ok(key)
    }

    pub fn set_master_key(&mut self, key: [u8; MASTER_KEY_SIZE]) {
        self.master_key = Some(key);
    }

    pub fn encrypt_data(&self, plaintext: &[u8]) -> Result<EncryptionResult, String> {
        if self.master_key.is_none() {
            return Err("Master key not set".to_string());
        }

        let master_key = self.master_key.unwrap();
        let nonce = self.generate_nonce()?;
        let mut ciphertext = vec![0u8; plaintext.len() + TAG_SIZE];
        let mut ciphertext_len = 0u64;

        unsafe {
            let result = crypto_aead_xchacha20poly1305_ietf_encrypt(
                ciphertext.as_mut_ptr(),
                &mut ciphertext_len,
                plaintext.as_ptr(),
                plaintext.len() as c_ulonglong,
                ptr::null(),
                0,
                ptr::null(),
                nonce.as_ptr(),
                master_key.as_ptr(),
            );

            if result != 0 {
                return Err("Encryption failed".to_string());
            }
        }

        ciphertext.truncate(ciphertext_len as usize);
        
        // Split ciphertext and tag
        let tag_start = ciphertext.len() - TAG_SIZE;
        let tag = ciphertext[tag_start..].to_vec();
        ciphertext.truncate(tag_start);

        Ok(EncryptionResult {
            ciphertext,
            nonce,
            salt: vec![], // Salt is only used for key derivation
            tag,
        })
    }

    pub fn decrypt_data(&self, encrypted: &EncryptionResult) -> Result<DecryptionResult, String> {
        if self.master_key.is_none() {
            return Err("Master key not set".to_string());
        }

        let master_key = self.master_key.unwrap();
        let mut combined_ciphertext = encrypted.ciphertext.clone();
        combined_ciphertext.extend_from_slice(&encrypted.tag);

        let mut plaintext = vec![0u8; encrypted.ciphertext.len()];
        let mut plaintext_len = 0u64;

        unsafe {
            let result = crypto_aead_xchacha20poly1305_ietf_decrypt(
                plaintext.as_mut_ptr(),
                &mut plaintext_len,
                ptr::null_mut(),
                combined_ciphertext.as_ptr(),
                combined_ciphertext.len() as c_ulonglong,
                ptr::null(),
                0,
                encrypted.nonce.as_ptr(),
                master_key.as_ptr(),
            );

            if result != 0 {
                return Ok(DecryptionResult {
                    plaintext: vec![],
                    verified: false,
                });
            }
        }

        plaintext.truncate(plaintext_len as usize);

        Ok(DecryptionResult {
            plaintext,
            verified: true,
        })
    }

    pub fn encrypt_file(&self, file_path: &str) -> Result<String, String> {
        let content = std::fs::read(file_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let encrypted = self.encrypt_data(&content)?;
        let encrypted_path = format!("{}.encrypted", file_path);

        let serialized = serde_json::to_vec(&encrypted)
            .map_err(|e| format!("Failed to serialize encrypted data: {}", e))?;

        std::fs::write(&encrypted_path, serialized)
            .map_err(|e| format!("Failed to write encrypted file: {}", e))?;

        Ok(encrypted_path)
    }

    pub fn decrypt_file(&self, encrypted_file_path: &str) -> Result<String, String> {
        let encrypted_data = std::fs::read(encrypted_file_path)
            .map_err(|e| format!("Failed to read encrypted file: {}", e))?;

        let encrypted: EncryptionResult = serde_json::from_slice(&encrypted_data)
            .map_err(|e| format!("Failed to deserialize encrypted data: {}", e))?;

        let decrypted = self.decrypt_data(&encrypted)?;
        
        if !decrypted.verified {
            return Err("Decryption verification failed".to_string());
        }

        let output_path = encrypted_file_path.replace(".encrypted", ".decrypted");
        std::fs::write(&output_path, decrypted.plaintext)
            .map_err(|e| format!("Failed to write decrypted file: {}", e))?;

        Ok(output_path)
    }

    pub fn generate_nonce(&self) -> Result<Vec<u8>, String> {
        let mut nonce = vec![0u8; NONCE_SIZE];
        
        unsafe {
            randombytes_buf(nonce.as_mut_ptr() as *mut std::ffi::c_void, NONCE_SIZE);
        }

        Ok(nonce)
    }

    pub fn generate_salt(&self) -> Result<Vec<u8>, String> {
        let mut salt = vec![0u8; SALT_SIZE];
        
        unsafe {
            randombytes_buf(salt.as_mut_ptr() as *mut std::ffi::c_void, SALT_SIZE);
        }

        Ok(salt)
    }

    pub fn hash_password(&self, password: &str, salt: &[u8]) -> Result<String, String> {
        if salt.len() != SALT_SIZE {
            return Err(format!("Salt must be exactly {} bytes", SALT_SIZE));
        }

        let mut hash = vec![0u8; crypto_pwhash_STRBYTES as usize];

        unsafe {
            let result = crypto_pwhash_str(
                hash.as_mut_ptr() as *mut c_char,
                password.as_ptr() as *const c_char,
                password.len() as c_ulonglong,
                crypto_pwhash_OPSLIMIT_INTERACTIVE as c_ulonglong,
                crypto_pwhash_MEMLIMIT_INTERACTIVE,
            );

            if result != 0 {
                return Err("Password hashing failed".to_string());
            }
        }

        // Find the null terminator
        let null_pos = hash.iter().position(|&x| x == 0).unwrap_or(hash.len());
        let hash_str = String::from_utf8(hash[..null_pos].to_vec())
            .map_err(|e| format!("Failed to convert hash to string: {}", e))?;

        Ok(hash_str)
    }

    pub fn verify_password(&self, password: &str, hash: &str) -> Result<bool, String> {
        let hash_cstring = CString::new(hash)
            .map_err(|e| format!("Invalid hash string: {}", e))?;

        unsafe {
            let result = crypto_pwhash_str_verify(
                hash_cstring.as_ptr(),
                password.as_ptr() as *const c_char,
                password.len() as c_ulonglong,
            );

            Ok(result == 0)
        }
    }

    pub fn secure_compare(&self, a: &[u8], b: &[u8]) -> bool {
        if a.len() != b.len() {
            return false;
        }

        unsafe {
            sodium_memcmp(
                a.as_ptr() as *const std::ffi::c_void,
                b.as_ptr() as *const std::ffi::c_void,
                a.len(),
            ) == 0
        }
    }

    pub fn secure_zero(&self, data: &mut [u8]) {
        unsafe {
            sodium_memzero(data.as_mut_ptr() as *mut std::ffi::c_void, data.len());
        }
    }
}

impl Drop for EncryptionEngine {
    fn drop(&mut self) {
        if let Some(mut key) = self.master_key.take() {
            self.secure_zero(&mut key);
        }
    }
}

// FFI exports for JavaScript integration
use std::sync::{Arc, Mutex};

static mut ENGINE_INSTANCE: Option<Arc<Mutex<EncryptionEngine>>> = None;

#[no_mangle]
pub extern "C" fn create_encryption_engine() -> *mut std::ffi::c_void {
    match EncryptionEngine::new() {
        Ok(engine) => {
            let engine_arc = Arc::new(Mutex::new(engine));
            unsafe {
                ENGINE_INSTANCE = Some(engine_arc.clone());
            }
            Arc::into_raw(engine_arc) as *mut std::ffi::c_void
        }
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn initialize_with_password(
    engine_ptr: *mut std::ffi::c_void,
    password: *const c_char,
    salt: *const c_uchar,
    salt_len: usize,
) -> bool {
    if engine_ptr.is_null() || password.is_null() {
        return false;
    }

    unsafe {
        let password_str = match CStr::from_ptr(password).to_str() {
            Ok(s) => s,
            Err(_) => return false,
        };

        let salt_slice = if salt.is_null() {
            None
        } else {
            Some(std::slice::from_raw_parts(salt, salt_len))
        };

        if let Some(ref engine_arc) = ENGINE_INSTANCE {
            if let Ok(mut engine) = engine_arc.lock() {
                engine.initialize_with_password(password_str, salt_slice).is_ok()
            } else {
                false
            }
        } else {
            false
        }
    }
}

#[no_mangle]
pub extern "C" fn encrypt_data(
    engine_ptr: *mut std::ffi::c_void,
    plaintext: *const c_uchar,
    plaintext_len: usize,
    result_json: *mut *mut c_char,
) -> bool {
    if engine_ptr.is_null() || plaintext.is_null() || result_json.is_null() {
        return false;
    }

    unsafe {
        let data = std::slice::from_raw_parts(plaintext, plaintext_len);

        if let Some(ref engine_arc) = ENGINE_INSTANCE {
            if let Ok(engine) = engine_arc.lock() {
                match engine.encrypt_data(data) {
                    Ok(encrypted) => {
                        if let Ok(json) = serde_json::to_string(&encrypted) {
                            if let Ok(c_str) = CString::new(json) {
                                *result_json = c_str.into_raw();
                                return true;
                            }
                        }
                    }
                    Err(_) => return false,
                }
            }
        }
        false
    }
}

#[no_mangle]
pub extern "C" fn decrypt_data(
    engine_ptr: *mut std::ffi::c_void,
    encrypted_json: *const c_char,
    result_json: *mut *mut c_char,
) -> bool {
    if engine_ptr.is_null() || encrypted_json.is_null() || result_json.is_null() {
        return false;
    }

    unsafe {
        let json_str = match CStr::from_ptr(encrypted_json).to_str() {
            Ok(s) => s,
            Err(_) => return false,
        };

        let encrypted: EncryptionResult = match serde_json::from_str(json_str) {
            Ok(e) => e,
            Err(_) => return false,
        };

        if let Some(ref engine_arc) = ENGINE_INSTANCE {
            if let Ok(engine) = engine_arc.lock() {
                match engine.decrypt_data(&encrypted) {
                    Ok(decrypted) => {
                        if let Ok(json) = serde_json::to_string(&decrypted) {
                            if let Ok(c_str) = CString::new(json) {
                                *result_json = c_str.into_raw();
                                return true;
                            }
                        }
                    }
                    Err(_) => return false,
                }
            }
        }
        false
    }
}

#[no_mangle]
pub extern "C" fn destroy_encryption_engine(engine_ptr: *mut std::ffi::c_void) {
    if !engine_ptr.is_null() {
        unsafe {
            let _ = Arc::from_raw(engine_ptr as *const Mutex<EncryptionEngine>);
            ENGINE_INSTANCE = None;
        }
    }
}

#[no_mangle]
pub extern "C" fn free_string(s: *mut c_char) {
    if !s.is_null() {
        unsafe {
            let _ = CString::from_raw(s);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encryption_engine_creation() {
        let engine = EncryptionEngine::new();
        assert!(engine.is_ok());
    }

    #[test]
    fn test_key_generation() {
        let mut engine = EncryptionEngine::new().unwrap();
        let key = engine.generate_key();
        assert!(key.is_ok());
        
        let key_bytes = key.unwrap();
        assert_eq!(key_bytes.len(), MASTER_KEY_SIZE);
        assert_ne!(key_bytes, [0u8; MASTER_KEY_SIZE]); // Should not be all zeros
    }

    #[test]
    fn test_password_initialization() {
        let mut engine = EncryptionEngine::new().unwrap();
        let salt = engine.generate_salt().unwrap();
        
        let result = engine.initialize_with_password("test_password", Some(&salt));
        assert!(result.is_ok());
    }

    #[test]
    fn test_encrypt_decrypt_cycle() {
        let mut engine = EncryptionEngine::new().unwrap();
        engine.generate_key().unwrap();

        let plaintext = b"Hello, World! This is a test message.";
        
        let encrypted = engine.encrypt_data(plaintext).unwrap();
        assert_ne!(encrypted.ciphertext, plaintext);
        assert_eq!(encrypted.nonce.len(), NONCE_SIZE);
        assert_eq!(encrypted.tag.len(), TAG_SIZE);

        let decrypted = engine.decrypt_data(&encrypted).unwrap();
        assert!(decrypted.verified);
        assert_eq!(decrypted.plaintext, plaintext);
    }

    #[test]
    fn test_encrypt_decrypt_with_wrong_key() {
        let mut engine1 = EncryptionEngine::new().unwrap();
        let mut engine2 = EncryptionEngine::new().unwrap();
        
        engine1.generate_key().unwrap();
        engine2.generate_key().unwrap();

        let plaintext = b"Secret message";
        let encrypted = engine1.encrypt_data(plaintext).unwrap();
        
        let decrypted = engine2.decrypt_data(&encrypted).unwrap();
        assert!(!decrypted.verified);
    }

    #[test]
    fn test_password_hashing_and_verification() {
        let engine = EncryptionEngine::new().unwrap();
        let salt = engine.generate_salt().unwrap();
        
        let password = "secure_password123";
        let hash = engine.hash_password(password, &salt).unwrap();
        
        assert!(engine.verify_password(password, &hash).unwrap());
        assert!(!engine.verify_password("wrong_password", &hash).unwrap());
    }

    #[test]
    fn test_secure_compare() {
        let engine = EncryptionEngine::new().unwrap();
        
        let data1 = b"identical_data";
        let data2 = b"identical_data";
        let data3 = b"different_data";
        
        assert!(engine.secure_compare(data1, data2));
        assert!(!engine.secure_compare(data1, data3));
        assert!(!engine.secure_compare(b"short", b"longer_data"));
    }

    #[test]
    fn test_secure_zero() {
        let engine = EncryptionEngine::new().unwrap();
        let mut sensitive_data = vec![1, 2, 3, 4, 5];
        
        engine.secure_zero(&mut sensitive_data);
        assert_eq!(sensitive_data, vec![0, 0, 0, 0, 0]);
    }

    #[test]
    fn test_file_encryption_decryption() {
        use std::io::Write;
        use tempfile::NamedTempFile;

        let mut engine = EncryptionEngine::new().unwrap();
        engine.generate_key().unwrap();

        // Create a temporary file
        let mut temp_file = NamedTempFile::new().unwrap();
        let test_content = b"This is test file content for encryption.";
        temp_file.write_all(test_content).unwrap();
        
        let file_path = temp_file.path().to_str().unwrap();
        
        // Encrypt the file
        let encrypted_path = engine.encrypt_file(file_path).unwrap();
        assert!(std::path::Path::new(&encrypted_path).exists());
        
        // Decrypt the file
        let decrypted_path = engine.decrypt_file(&encrypted_path).unwrap();
        assert!(std::path::Path::new(&decrypted_path).exists());
        
        // Verify content
        let decrypted_content = std::fs::read(&decrypted_path).unwrap();
        assert_eq!(decrypted_content, test_content);
        
        // Cleanup
        std::fs::remove_file(&encrypted_path).ok();
        std::fs::remove_file(&decrypted_path).ok();
    }

    #[test]
    fn test_nonce_generation() {
        let engine = EncryptionEngine::new().unwrap();
        
        let nonce1 = engine.generate_nonce().unwrap();
        let nonce2 = engine.generate_nonce().unwrap();
        
        assert_eq!(nonce1.len(), NONCE_SIZE);
        assert_eq!(nonce2.len(), NONCE_SIZE);
        assert_ne!(nonce1, nonce2); // Should be different
    }

    #[test]
    fn test_ffi_integration() {
        let engine_ptr = create_encryption_engine();
        assert!(!engine_ptr.is_null());

        let password = CString::new("test_password").unwrap();
        let result = initialize_with_password(engine_ptr, password.as_ptr(), std::ptr::null(), 0);
        assert!(result);

        destroy_encryption_engine(engine_ptr);
    }

    #[test]
    fn test_large_data_encryption() {
        let mut engine = EncryptionEngine::new().unwrap();
        engine.generate_key().unwrap();

        // Test with 1MB of data
        let large_data = vec![42u8; 1024 * 1024];
        
        let encrypted = engine.encrypt_data(&large_data).unwrap();
        let decrypted = engine.decrypt_data(&encrypted).unwrap();
        
        assert!(decrypted.verified);
        assert_eq!(decrypted.plaintext, large_data);
    }
}