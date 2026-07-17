package com.pjsktools.core.common

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
interface AppClock { fun nowMillis(): Long }

class SystemAppClock : AppClock {
    override fun nowMillis(): Long = System.currentTimeMillis()
}

data class AppDispatchers(
    val io: CoroutineDispatcher = Dispatchers.IO,
    val default: CoroutineDispatcher = Dispatchers.Default
)
