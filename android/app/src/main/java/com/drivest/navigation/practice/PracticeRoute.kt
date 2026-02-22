package com.drivest.navigation.practice

data class PracticeRoutePoint(
    val lat: Double,
    val lon: Double
)

data class PracticeRoute(
    val id: String,
    val name: String,
    val geometry: List<PracticeRoutePoint>,
    val distanceM: Double,
    val durationS: Double,
    val startLat: Double,
    val startLon: Double
)
