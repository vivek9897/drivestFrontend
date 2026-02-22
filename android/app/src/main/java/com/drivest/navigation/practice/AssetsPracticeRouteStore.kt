package com.drivest.navigation.practice

import android.content.Context
import org.json.JSONObject

class AssetsPracticeRouteStore(private val context: Context) : PracticeRouteStore {

    override fun loadRoutesForCentre(centreId: String): List<PracticeRoute> {
        return runCatching {
            val assetPath = "routes/$centreId/routes.json"
            val jsonText = context.assets.open(assetPath).bufferedReader().use { it.readText() }
            val root = JSONObject(jsonText)
            val routesArray = root.getJSONArray("routes")

            buildList {
                for (i in 0 until routesArray.length()) {
                    val routeJson = routesArray.getJSONObject(i)
                    val geometryArray = routeJson.getJSONArray("geometry")
                    val geometry = buildList {
                        for (g in 0 until geometryArray.length()) {
                            val point = geometryArray.getJSONObject(g)
                            add(
                                PracticeRoutePoint(
                                    lat = point.getDouble("lat"),
                                    lon = point.getDouble("lon")
                                )
                            )
                        }
                    }

                    add(
                        PracticeRoute(
                            id = routeJson.getString("id"),
                            name = routeJson.getString("name"),
                            geometry = geometry,
                            distanceM = routeJson.optDouble("distanceM", 0.0),
                            durationS = routeJson.optDouble("durationS", 0.0),
                            startLat = routeJson.optDouble("startLat", geometry.firstOrNull()?.lat ?: 0.0),
                            startLon = routeJson.optDouble("startLon", geometry.firstOrNull()?.lon ?: 0.0)
                        )
                    )
                }
            }
        }.getOrDefault(emptyList())
    }
}
