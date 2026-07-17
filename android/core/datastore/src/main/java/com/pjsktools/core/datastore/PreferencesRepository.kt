package com.pjsktools.core.datastore

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.pjsktools.core.model.Region
import com.pjsktools.core.model.RegionPreferencesRepository
import com.pjsktools.core.model.ThemeMode
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.settingsDataStore by preferencesDataStore("settings")

@Singleton
class DataStoreRegionPreferences @Inject constructor(@ApplicationContext private val context: Context) : RegionPreferencesRepository {
    private val regionKey = stringPreferencesKey("selected_region")
    private val themeKey = stringPreferencesKey("theme_mode")
    override val selectedRegion: Flow<Region?> = context.settingsDataStore.data.map { Region.fromId(it[regionKey]) }
    override val themeMode: Flow<ThemeMode> = context.settingsDataStore.data.map { value -> runCatching { ThemeMode.valueOf(value[themeKey] ?: ThemeMode.SYSTEM.name) }.getOrDefault(ThemeMode.SYSTEM) }
    override suspend fun selectRegion(region: Region) { context.settingsDataStore.edit { it[regionKey] = region.id } }
    override suspend fun setTheme(mode: ThemeMode) { context.settingsDataStore.edit { it[themeKey] = mode.name } }
}

@Module @InstallIn(SingletonComponent::class)
abstract class DataStoreBindings { @Binds abstract fun bindRegionPreferences(impl: DataStoreRegionPreferences): RegionPreferencesRepository }
