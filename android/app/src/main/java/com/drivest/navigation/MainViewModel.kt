package com.drivest.navigation

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import com.drivest.navigation.session.NavigationSessionManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class DestinationUiState(
    val lat: Double,
    val lon: Double,
    val name: String?
)

data class MainUiState(
    val mode: String = AppFlow.MODE_PRACTICE,
    val centreId: String = "colchester",
    val routeId: String? = null,
    val destination: DestinationUiState? = null,
    val sessionState: NavigationSessionManager.SessionState = NavigationSessionManager.SessionState.BROWSE
)

class MainViewModel(
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        MainUiState(
            mode = savedStateHandle[KEY_MODE] ?: AppFlow.MODE_PRACTICE,
            centreId = savedStateHandle[KEY_CENTRE_ID] ?: "colchester",
            routeId = savedStateHandle[KEY_ROUTE_ID],
            destination = readDestinationFromHandle(),
            sessionState = savedStateHandle[KEY_SESSION_STATE] ?: NavigationSessionManager.SessionState.BROWSE
        )
    )

    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    fun setMode(mode: String) {
        updateState { it.copy(mode = mode) }
        savedStateHandle[KEY_MODE] = mode
    }

    fun setCentre(centreId: String) {
        updateState { it.copy(centreId = centreId) }
        savedStateHandle[KEY_CENTRE_ID] = centreId
    }

    fun setRoute(routeId: String?) {
        updateState { it.copy(routeId = routeId) }
        savedStateHandle[KEY_ROUTE_ID] = routeId
    }

    fun setDestination(destination: DestinationUiState?) {
        updateState { it.copy(destination = destination) }
        savedStateHandle[KEY_DESTINATION_LAT] = destination?.lat
        savedStateHandle[KEY_DESTINATION_LON] = destination?.lon
        savedStateHandle[KEY_DESTINATION_NAME] = destination?.name
    }

    fun setSessionState(state: NavigationSessionManager.SessionState) {
        updateState { it.copy(sessionState = state) }
        savedStateHandle[KEY_SESSION_STATE] = state
    }

    private fun updateState(reducer: (MainUiState) -> MainUiState) {
        _uiState.update(reducer)
    }

    private fun readDestinationFromHandle(): DestinationUiState? {
        val lat = savedStateHandle.get<Double>(KEY_DESTINATION_LAT) ?: return null
        val lon = savedStateHandle.get<Double>(KEY_DESTINATION_LON) ?: return null
        val name = savedStateHandle.get<String>(KEY_DESTINATION_NAME)
        return DestinationUiState(lat = lat, lon = lon, name = name)
    }

    private companion object {
        private const val KEY_MODE = "mode"
        private const val KEY_CENTRE_ID = "centre_id"
        private const val KEY_ROUTE_ID = "route_id"
        private const val KEY_DESTINATION_LAT = "destination_lat"
        private const val KEY_DESTINATION_LON = "destination_lon"
        private const val KEY_DESTINATION_NAME = "destination_name"
        private const val KEY_SESSION_STATE = "session_state"
    }
}
