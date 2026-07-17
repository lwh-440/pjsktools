package com.pjsktools.app.core.config

import com.pjsktools.core.model.ApiEnvironment
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module @InstallIn(SingletonComponent::class)
abstract class EnvironmentModule { @Binds abstract fun bindApiEnvironment(environment: AppEnvironment): ApiEnvironment }
