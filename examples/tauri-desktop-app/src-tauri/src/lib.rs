use tauri::Emitter;

#[tauri::command]
fn greet(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Please enter a name".into());
    }
    Ok(format!("Hello, {name}! You've been greeted from Rust!"))
}

#[tauri::command]
fn notify(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .emit_to(window.label(), "notification", "A notification arrived from Rust.")
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, notify])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greeting_returns_the_request_value() {
        assert_eq!(greet(" Ada ").unwrap(), "Hello, Ada! You've been greeted from Rust!");
    }

    #[test]
    fn empty_names_return_errors() {
        assert_eq!(greet("").unwrap_err(), "Please enter a name");
        assert_eq!(greet("   ").unwrap_err(), "Please enter a name");
    }
}
