//! Typed application errors. All public commands return `Result<T, AppError>`.
//!
//! Serialization: errors cross the IPC boundary as `{ code, message }` objects
//! so the frontend can discriminate without string parsing.

use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("path does not exist: {0}")]
    PathNotFound(PathBuf),

    #[error("path is not a directory: {0}")]
    NotADirectory(PathBuf),

    #[error("path is not writable: {0}")]
    NotWritable(PathBuf),

    #[error("vault already exists at: {0}")]
    VaultAlreadyExists(PathBuf),

    #[error("no active vault")]
    NoActiveVault,

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serde error: {0}")]
    Serde(String),

    #[error("shortcut error: {0}")]
    Shortcut(String),
}

impl AppError {
    fn code(&self) -> &'static str {
        match self {
            AppError::PathNotFound(_) => "path_not_found",
            AppError::NotADirectory(_) => "not_a_directory",
            AppError::NotWritable(_) => "not_writable",
            AppError::VaultAlreadyExists(_) => "vault_already_exists",
            AppError::NoActiveVault => "no_active_vault",
            AppError::Io(_) => "io",
            AppError::Serde(_) => "serde",
            AppError::Shortcut(_) => "shortcut",
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Serde(e.to_string())
    }
}

impl From<serde_yaml::Error> for AppError {
    fn from(e: serde_yaml::Error) -> Self {
        AppError::Serde(e.to_string())
    }
}

#[derive(Serialize)]
struct SerializedError<'a> {
    code: &'a str,
    message: String,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        SerializedError {
            code: self.code(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
