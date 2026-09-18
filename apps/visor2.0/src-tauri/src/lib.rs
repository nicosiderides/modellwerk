use std::{fs, path::Path};

const MAX_PROJECT_BYTES: usize = 5_000_000;

fn supported_project_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "mwproject" | "json"
            )
        })
}

#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    let path = Path::new(&path);
    if !supported_project_path(path) {
        return Err("El archivo debe tener extensión .mwproject o .json.".into());
    }
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_PROJECT_BYTES as u64 {
        return Err("El archivo supera el límite de 5 MB.".into());
    }
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_project_file(path: String, contents: String) -> Result<(), String> {
    let path = Path::new(&path);
    if path.extension().and_then(|extension| extension.to_str()) != Some("mwproject") {
        return Err("La copia debe guardarse con extensión .mwproject.".into());
    }
    if contents.len() > MAX_PROJECT_BYTES {
        return Err("El proyecto supera el límite de 5 MB.".into());
    }
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            read_project_file,
            write_project_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running MODELLWERK desktop");
}
