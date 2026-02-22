package com.drivest.navigation.settings

enum class VoiceModeSetting(val storageValue: String) {
    ALL("all"),
    ALERTS("alerts"),
    MUTE("mute");

    companion object {
        fun fromStorage(value: String?): VoiceModeSetting {
            return entries.firstOrNull { it.storageValue == value } ?: ALL
        }
    }
}

enum class PreferredUnitsSetting(val storageValue: String) {
    UK_MPH("uk_mph"),
    METRIC_KMH("metric_kmh");

    companion object {
        fun fromStorage(value: String?): PreferredUnitsSetting {
            return entries.firstOrNull { it.storageValue == value } ?: UK_MPH
        }
    }
}
