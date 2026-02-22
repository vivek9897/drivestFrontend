package com.drivest.navigation.data

import android.content.Context
import org.json.JSONArray

class CentreRepository(private val context: Context) {

    fun loadCentres(): List<TestCentre> {
        return runCatching {
            val jsonText = context.assets.open("centres.json").bufferedReader().use { it.readText() }
            val centresArray = JSONArray(jsonText)
            buildList {
                for (i in 0 until centresArray.length()) {
                    val item = centresArray.getJSONObject(i)
                    add(
                        TestCentre(
                            id = item.getString("id"),
                            name = item.getString("name"),
                            address = item.getString("address"),
                            lat = item.getDouble("lat"),
                            lon = item.getDouble("lon")
                        )
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    fun findById(centreId: String): TestCentre? {
        return loadCentres().firstOrNull { it.id == centreId }
    }
}
