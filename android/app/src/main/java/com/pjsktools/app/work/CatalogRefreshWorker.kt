package com.pjsktools.app.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.pjsktools.core.model.*
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.first

@EntryPoint @InstallIn(SingletonComponent::class)
interface CatalogWorkerEntryPoint {
    fun preferences(): RegionPreferencesRepository
    fun songs(): SongsRepository
    fun cards(): CardsRepository
    fun collections(): CollectionsRepository
}

class CatalogRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val entry = EntryPointAccessors.fromApplication(applicationContext, CatalogWorkerEntryPoint::class.java)
        val region = entry.preferences().selectedRegion.first() ?: return Result.success()
        return runCatching {
            entry.songs().observe(region, SongQuery(pageSize = 100), refresh = true).first { it.phase in setOf(ContentPhase.CONTENT, ContentPhase.ERROR, ContentPhase.OFFLINE, ContentPhase.UNAVAILABLE) }
            entry.cards().observe(region, CardQuery(pageSize = 100), refresh = true).first { it.phase in setOf(ContentPhase.CONTENT, ContentPhase.ERROR, ContentPhase.OFFLINE, ContentPhase.UNAVAILABLE) }
            CatalogKind.entries.forEach { entry.collections().refreshCatalog(region, it) }
        }.fold(onSuccess = { Result.success() }, onFailure = { Result.retry() })
    }
}
