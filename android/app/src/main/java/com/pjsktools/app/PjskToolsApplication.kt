package com.pjsktools.app

import android.app.Application
import android.os.Handler
import android.os.Looper
import androidx.work.Configuration
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.svg.SvgDecoder
import coil3.disk.DiskCache
import coil3.memory.MemoryCache
import com.pjsktools.app.work.CatalogRefreshWorker
import com.pjsktools.core.network.ImageHttpClient
import dagger.hilt.android.HiltAndroidApp
import okhttp3.OkHttpClient
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import okio.Path.Companion.toOkioPath
import javax.inject.Inject

@HiltAndroidApp
class PjskToolsApplication : Application(), Configuration.Provider, SingletonImageLoader.Factory {
    @Inject @ImageHttpClient lateinit var imageHttpClient: OkHttpClient

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().build()

    override fun onCreate() {
        super.onCreate()
        Handler(Looper.getMainLooper()).postDelayed({ scheduleCatalogRefresh() }, 5_000)
    }

    override fun newImageLoader(context: android.content.Context): ImageLoader = ImageLoader.Builder(context)
        .memoryCache { MemoryCache.Builder().maxSizePercent(context, 0.20).build() }
        .diskCache {
            DiskCache.Builder()
                .directory(context.cacheDir.resolve("coil-images").toOkioPath())
                .maxSizeBytes(256L * 1024 * 1024)
                .build()
        }
        .components {
            add(OkHttpNetworkFetcherFactory(callFactory = { imageHttpClient }))
            add(SvgDecoder.Factory())
        }
        .build()

    private fun scheduleCatalogRefresh() {
        val executor = Executors.newSingleThreadExecutor()
        executor.execute {
            try {
                val request = PeriodicWorkRequestBuilder<CatalogRefreshWorker>(24, TimeUnit.HOURS)
                    .setInitialDelay(6, TimeUnit.HOURS)
                    .setConstraints(
                        Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .setRequiresBatteryNotLow(true)
                            .setRequiresStorageNotLow(true)
                            .build()
                    )
                    .build()
                WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                    "catalog-refresh",
                    ExistingPeriodicWorkPolicy.KEEP,
                    request
                )
            } finally {
                executor.shutdown()
            }
        }
    }
}
