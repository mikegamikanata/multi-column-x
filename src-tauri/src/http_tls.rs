//! reqwest クライアントの TLS 設定（暗号プロバイダと証明書検証）の共通処理。
//!
//! - 暗号プロバイダ: reqwest を `rustls-no-provider` で使うため、クライアント構築前に
//!   ring プロバイダを install する（未設定だと `ClientBuilder::build()` が panic する）。
//!   aws-lc-rs を入れない理由は Android / Windows のビルド依存を増やさないため。
//! - 証明書検証: desktop は reqwest 既定の OS 検証器（rustls-platform-verifier）。
//!   Android は platform-verifier の JNI 初期化を避けるため、同梱ルート証明書
//!   （webpki-root-certs）だけを信頼する。

/// ring の暗号プロバイダをプロセス既定として install する（2 回目以降は何もしない）。
pub(crate) fn ensure_crypto_provider() {
    // 既に install 済み（updater など他の経路が先に install した場合を含む）なら Err が返るだけなので無視する。
    let _ = rustls::crypto::ring::default_provider().install_default();
}

/// 全 reqwest クライアント共通の TLS 設定を適用する。
pub(crate) fn configure_tls(builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    ensure_crypto_provider();
    #[cfg(target_os = "android")]
    {
        with_bundled_roots_only(builder)
    }
    #[cfg(not(target_os = "android"))]
    {
        builder
    }
}

/// 同梱ルート証明書だけを信頼する設定にする（Android で使用。テストのため cfg なし）。
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub(crate) fn with_bundled_roots_only(builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    builder.tls_certs_only(bundled_root_certs())
}

/// webpki-root-certs の同梱ルート証明書を reqwest の証明書に変換する。
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
fn bundled_root_certs() -> Vec<reqwest::Certificate> {
    webpki_root_certs::TLS_SERVER_ROOT_CERTS
        .iter()
        .filter_map(|der| reqwest::Certificate::from_der(der.as_ref()).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 同梱ルート証明書だけで検証する設定の通信クライアントを作成できる() {
        ensure_crypto_provider();
        let client = with_bundled_roots_only(reqwest::Client::builder()).build();
        assert!(client.is_ok());
    }

    #[test]
    fn 同梱ルート証明書が1件以上含まれる() {
        let certs = bundled_root_certs();
        assert!(!certs.is_empty());
        assert_eq!(certs.len(), webpki_root_certs::TLS_SERVER_ROOT_CERTS.len());
    }
}
