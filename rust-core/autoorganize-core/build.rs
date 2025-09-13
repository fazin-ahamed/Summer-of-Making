use std::env;
use std::path::PathBuf;

fn main() {
    let udl_file = "src/autoorganize.udl";
    let out_dir = env::var("OUT_DIR").unwrap();
    
    println!("cargo:rerun-if-changed={}", udl_file);
    
    uniffi::generate_scaffolding(udl_file).unwrap();
    
    // Generate bindings for different languages
    let binding_dir = PathBuf::from(&out_dir).join("bindings");
    std::fs::create_dir_all(&binding_dir).unwrap();
    
    // Generate TypeScript bindings for React Native
    uniffi::generate_bindings(
        udl_file,
        None,
        vec!["typescript".to_string()],
        Some(&binding_dir),
        Some("autoorganize".to_string()),
        false,
    ).unwrap();
}