package com.pjsktools.app.core.config

import com.pjsktools.app.BuildConfig
import com.pjsktools.core.model.ApiEnvironment
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppEnvironment @Inject constructor() : ApiEnvironment {
    override val apiBaseUrl: String = BuildConfig.API_BASE_URL
    override val buildType: String = BuildConfig.BUILD_TYPE
    val isDebug: Boolean = BuildConfig.DEBUG
}
