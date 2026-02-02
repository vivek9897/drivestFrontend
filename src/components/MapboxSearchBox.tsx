import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { TextInput, Text, Divider } from 'react-native-paper';
import { SearchResult } from '../types/mapbox';
import {
  searchPlaces,
  getPlaceSuggestions,
} from '../lib/mapboxSearch';
import { formatSearchResult, generateSessionToken } from '../utils/mapbox';
import { colors, spacing } from '../styles/theme';

export interface MapboxSearchBoxProps {
  onSelectLocation: (result: SearchResult) => void;
  placeholder?: string;
  label?: string;
  initialValue?: string;
  disabled?: boolean;
  proximity?: [number, number]; // [longitude, latitude]
}

/**
 * MapboxSearchBox Component
 * A text input component with autocomplete suggestions for location search
 * Features:
 * - Debounced search (300ms)
 * - Autocomplete suggestions with Mapbox Geocoding API
 * - Session tokens for billing optimization
 * - Loading states
 * - UK-focused search
 *
 * @example
 * <MapboxSearchBox
 *   onSelectLocation={(result) => {
 *     console.log('Selected:', result.place_name);
 *   }}
 *   placeholder="Search location..."
 *   proximity={[-3.1, 55.95]}
 * />
 */
export const MapboxSearchBox: React.FC<MapboxSearchBoxProps> = ({
  onSelectLocation,
  placeholder = 'Search location...',
  label = 'Location',
  initialValue = '',
  disabled = false,
  proximity,
}) => {
  const [input, setInput] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sessionToken] = useState(generateSessionToken());
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  /**
   * Handle input change with debounce
   * Triggers search after 300ms of inactivity
   */
  const handleInputChange = (value: string) => {
    setInput(value);

    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Only search if input has at least 2 characters
    if (value.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    setShowSuggestions(true);

    // Set new debounce timer
    debounceTimer.current = setTimeout(async () => {
      try {
        const results = await getPlaceSuggestions(value, sessionToken, proximity);
        setSuggestions(results);
      } catch (error) {
        console.error('Search error:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  };

  /**
   * Handle suggestion selection
   * Triggers parent callback and closes dropdown
   */
  const handleSelectSuggestion = (result: SearchResult) => {
    setInput(result.place_name);
    setShowSuggestions(false);
    setSuggestions([]);
    Keyboard.dismiss();
    onSelectLocation(result);
  };

  /**
   * Render individual suggestion item
   */
  const renderSuggestionItem = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={styles.suggestionItem}
      onPress={() => handleSelectSuggestion(item)}
      activeOpacity={0.6}
    >
      <View>
        <Text style={styles.suggestionText} numberOfLines={1}>
          {item.text}
        </Text>
        {item.place_name && item.place_name !== item.text && (
          <Text style={styles.suggestionSubtext} numberOfLines={1}>
            {formatSearchResult(item)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <TextInput
        label={label}
        placeholder={placeholder}
        value={input}
        onChangeText={handleInputChange}
        disabled={disabled}
        editable={!disabled}
        right={
          isLoading ? (
            <TextInput.Icon icon={() => <ActivityIndicator size={20} />} />
          ) : input ? (
            <TextInput.Icon
              icon="close"
              onPress={() => {
                setInput('');
                setSuggestions([]);
                setShowSuggestions(false);
              }}
            />
          ) : undefined
        }
        mode="outlined"
        style={styles.input}
        contentStyle={styles.inputContent}
        outlineColor={colors.border}
        activeOutlineColor={colors.primary}
        textColor={colors.text}
        placeholderTextColor={colors.textSecondary}
      />

      {/* Suggestions Dropdown */}
      {showSuggestions && (
        <View style={styles.suggestionsContainer}>
          {isLoading && suggestions.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : suggestions.length > 0 ? (
            <FlatList
              data={suggestions}
              renderItem={renderSuggestionItem}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              scrollEnabled={true}
              nestedScrollEnabled={true}
              maxHeight={300}
              ItemSeparatorComponent={() => (
                <Divider style={{ backgroundColor: colors.border }} />
              )}
            />
          ) : input.length >= 2 ? (
            <View style={styles.noResultsContainer}>
              <Text style={styles.noResultsText}>No results found</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
  },
  input: {
    backgroundColor: colors.background,
  },
  inputContent: {
    paddingVertical: spacing(1),
  },
  suggestionsContainer: {
    backgroundColor: colors.background,
    borderLeftColor: colors.border,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    maxHeight: 300,
    marginTop: -spacing(0.5),
    zIndex: 100,
  },
  suggestionItem: {
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(2),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestionText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: spacing(0.5),
  },
  suggestionSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  loadingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing(3),
    gap: spacing(2),
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  noResultsContainer: {
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(2),
    justifyContent: 'center',
    alignItems: 'center',
  },
  noResultsText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
