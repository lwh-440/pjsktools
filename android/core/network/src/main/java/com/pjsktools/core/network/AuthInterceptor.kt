package com.pjsktools.core.network

import com.pjsktools.api.generated.AndroidApi
import com.pjsktools.api.generated.RefreshTokenRequest
import com.pjsktools.core.model.ApiEnvironment
import com.pjsktools.core.model.SessionStorage
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.util.concurrent.locks.ReentrantLock
import javax.inject.Inject
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlin.concurrent.withLock

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class RawHttpClient

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class RawAndroidApi

@Singleton
class SessionAuthInterceptor @Inject constructor(
    private val environment: ApiEnvironment,
    private val sessions: SessionStorage,
    @RawAndroidApi private val rawApi: AndroidApi
) : Interceptor {
    private val refreshLock = ReentrantLock()

    override fun intercept(chain: Interceptor.Chain): Response {
        val backend = environment.apiBaseUrl.toHttpUrl()
        val original = chain.request()
        if (!isAllowedBackendUrl(backend, original.url)) return chain.proceed(original)
        val session = runBlocking { sessions.current() }
        val request = session?.let {
            original.newBuilder().header("Authorization", "Bearer ${it.accessToken}").build()
        } ?: original
        val response = chain.proceed(request)
        if (response.code != 401 || session == null || original.header("X-Auth-Retry") != null) return response
        val refreshed = refreshLock.withLock {
            runBlocking {
                val latest = sessions.current()
                if (latest != null && latest.accessToken != session.accessToken) latest
                else {
                    val next = rawApi.refreshSession(RefreshTokenRequest(session.refreshToken)).body()?.domainSession()
                    if (next == null) sessions.clear() else sessions.save(next)
                    next
                }
            }
        } ?: return response
        response.close()
        return chain.proceed(
            original.newBuilder()
                .header("Authorization", "Bearer ${refreshed.accessToken}")
                .header("X-Auth-Retry", "1")
                .build()
        )
    }
}
