package com.drivest.navigation.settings

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore by preferencesDataStore(name = "drivest_settings")

class SettingsRepository(private val context: Context) {

    val voiceMode: Flow<VoiceModeSetting> = context.settingsDataStore.data.map { preferences ->
        VoiceModeSetting.fromStorage(preferences[KEY_VOICE_MODE])
    }

    val preferredUnits: Flow<PreferredUnitsSetting> = context.settingsDataStore.data.map { preferences ->
        PreferredUnitsSetting.fromStorage(preferences[KEY_UNITS])
    }

    val lastSelectedCentreId: Flow<String> = context.settingsDataStore.data.map { preferences ->
        preferences[KEY_LAST_CENTRE_ID] ?: DEFAULT_CENTRE_ID
    }

    val lastMode: Flow<String> = context.settingsDataStore.data.map { preferences ->
        preferences[KEY_LAST_MODE] ?: DEFAULT_MODE
    }

    suspend fun setVoiceMode(mode: VoiceModeSetting) {
        context.settingsDataStore.edit { prefs ->
            prefs[KEY_VOICE_MODE] = mode.storageValue
        }
    }

    suspend fun setPreferredUnits(units: PreferredUnitsSetting) {
        context.settingsDataStore.edit { prefs ->
            prefs[KEY_UNITS] = units.storageValue
        }
    }

    suspend fun setLastSelectedCentreId(centreId: String) {
        context.settingsDataStore.edit { prefs ->
            prefs[KEY_LAST_CENTRE_ID] = centreId
        }
    }

    suspend fun setLastMode(mode: String) {
        context.settingsDataStore.edit { prefs ->
            prefs[KEY_LAST_MODE] = mode
        }
    }

    private companion object {
        val KEY_VOICE_MODE: Preferences.Key<String> = stringPreferencesKey("voice_mode")
        val KEY_UNITS: Preferences.Key<String> = stringPreferencesKey("preferred_units")
        val KEY_LAST_CENTRE_ID: Preferences.Key<String> = stringPreferencesKey("last_selected_centre_id")
        val KEY_LAST_MODE: Preferences.Key<String> = stringPreferencesKey("last_mode")

        const val DEFAULT_CENTRE_ID = "colchester"
        const val DEFAULT_MODE = "practice"
    }
}
