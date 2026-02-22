package com.drivest.navigation.practice

interface PracticeRouteStore {
    fun loadRoutesForCentre(centreId: String): List<PracticeRoute>
}
