package com.pjsktools.app.core

import com.pjsktools.app.BuildConfig
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import java.security.MessageDigest

object ApiOrigin {
    const val DEBUG_EMULATOR_DEFAULT = "http://10.0.2.2:4000"

    data class Resolution(val origin: String?, val editableValue: String, val error: String? = null) {
        val isAvailable: Boolean get() = origin != null
    }

    fun resolve(storedValue: String?, buildTimeValue: String, debug: Boolean): Resolution {
        val selected = storedValue?.takeIf(String::isNotBlank) ?: buildTimeValue.takeIf(String::isNotBlank)
            ?: if (debug) DEBUG_EMULATOR_DEFAULT else null
        if (selected == null) return Resolution(null, "", "请在设置中配置 HTTPS API Base URL")
        return runCatching { normalize(selected, debug, BuildConfig.TEMPORARY_HTTP_HOST) }
            .fold(
                onSuccess = { Resolution(it, it) },
                onFailure = { Resolution(null, selected, it.message ?: "API Base URL 无效") }
            )
    }

    fun normalize(baseUrl: String, allowLocalHttp: Boolean, temporaryHttpHost: String = ""): String {
        val raw = baseUrl.trim()
        val url = raw.toHttpUrlOrNull() ?: error("API Base URL 必须为有效的 http(s) 地址")
        require(url.username.isEmpty() && url.password.isEmpty()) { "API Base URL 不允许包含用户名或密码" }
        require(url.query == null && url.fragment == null) { "API Base URL 不允许包含查询参数或片段" }
        require(url.encodedPath == "/" || url.encodedPath.isEmpty()) { "API Base URL 只允许填写服务器 origin，不允许附加路径" }
        val temporaryRemoteHttp = temporaryHttpHost.isNotBlank() && url.scheme == "http" && url.host == temporaryHttpHost
        require(url.scheme == "https" || allowLocalHttp && url.scheme == "http" && isLocalHost(url.host) || temporaryRemoteHttp) {
            "远程 API 必须使用 HTTPS；HTTP 仅允许 debug 环境的本机或 Android 模拟器地址"
        }
        return origin(url)
    }

    fun namespace(origin: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(origin.toByteArray(Charsets.UTF_8))
        return bytes.take(12).joinToString("") { "%02x".format(it) }
    }

    private fun origin(url: HttpUrl): String = buildString {
        append(url.scheme).append("://").append(url.host)
        val defaultPort = if (url.scheme == "https") 443 else 80
        if (url.port != defaultPort) append(':').append(url.port)
    }

    private fun isLocalHost(host: String) = host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "10.0.2.2"
}
