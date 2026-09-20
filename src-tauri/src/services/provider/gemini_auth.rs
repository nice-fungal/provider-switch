//! Gemini authentication type detection
//!
//! Detects whether a Gemini provider uses Google OAuth or a generic API key.

use crate::error::AppError;
use crate::provider::Provider;

/// Gemini authentication type enumeration
///
/// Used to optimize performance by avoiding repeated provider type detection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum GeminiAuthType {
    /// Google Official (uses OAuth)
    GoogleOfficial,
    /// Generic Gemini provider (uses API Key)
    Generic,
}

const GOOGLE_OFFICIAL_PARTNER_KEY: &str = "google-official";

/// Detect Gemini provider authentication type
///
/// One-time detection to avoid repeated calls to `is_google_official_gemini`.
///
/// # Returns
///
/// - `GeminiAuthType::GoogleOfficial`: Google official, uses OAuth
/// - `GeminiAuthType::Generic`: Other generic providers, uses API Key
pub(crate) fn detect_gemini_auth_type(provider: &Provider) -> GeminiAuthType {
    // Priority 1: Check partner_promotion_key (most reliable)
    if let Some(key) = provider
        .meta
        .as_ref()
        .and_then(|meta| meta.partner_promotion_key.as_deref())
    {
        if key.eq_ignore_ascii_case(GOOGLE_OFFICIAL_PARTNER_KEY) {
            return GeminiAuthType::GoogleOfficial;
        }
    }

    // Priority 2: Check Google Official (name matching)
    let name_lower = provider.name.to_ascii_lowercase();
    if name_lower == "google" || name_lower.starts_with("google ") {
        return GeminiAuthType::GoogleOfficial;
    }

    GeminiAuthType::Generic
}

/// Detect if provider is Google Official Gemini (uses OAuth authentication)
///
/// Google Official Gemini uses OAuth personal authentication, no API Key needed.
///
/// This is a convenience wrapper around `detect_gemini_auth_type`.
pub(crate) fn is_google_official_gemini(provider: &Provider) -> bool {
    detect_gemini_auth_type(provider) == GeminiAuthType::GoogleOfficial
}

/// Ensure Google Official Gemini provider security flag is correctly set (OAuth mode)
///
/// Google Official Gemini uses OAuth personal authentication, no API Key needed.
///
/// # What it does
///
/// Writes to **`~/.gemini/settings.json`** (Gemini client config).
///
/// # Value set
///
/// ```json
/// {
///   "security": {
///     "auth": {
///       "selectedType": "oauth-personal"
///     }
///   }
/// }
/// ```
///
/// # OAuth authentication flow
///
/// 1. User switches to Google Official provider
/// 2. CC-Switch sets `selectedType = "oauth-personal"`
/// 3. User's first use of Gemini CLI will auto-open browser for OAuth login
/// 4. After successful login, credentials saved in Gemini credential store
/// 5. Subsequent requests auto-use saved credentials
///
/// # Error handling
///
/// If provider is not Google Official, function returns `Ok(())` immediately without any operation.
pub(crate) fn ensure_google_oauth_security_flag(provider: &Provider) -> Result<(), AppError> {
    if !is_google_official_gemini(provider) {
        return Ok(());
    }

    // Write to Gemini directory settings.json (~/.gemini/settings.json)
    use crate::gemini_config::write_google_oauth_settings;
    write_google_oauth_settings()?;

    Ok(())
}
