package com.drivest.navigation

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.drivest.navigation.data.DestinationSuggestion
import com.drivest.app.databinding.ItemDestinationSuggestionBinding

class DestinationSuggestionAdapter(
    private val onSuggestionClick: (DestinationSuggestion) -> Unit
) : ListAdapter<DestinationSuggestion, DestinationSuggestionAdapter.DestinationSuggestionViewHolder>(DiffCallback) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): DestinationSuggestionViewHolder {
        val binding = ItemDestinationSuggestionBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return DestinationSuggestionViewHolder(binding, onSuggestionClick)
    }

    override fun onBindViewHolder(holder: DestinationSuggestionViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class DestinationSuggestionViewHolder(
        private val binding: ItemDestinationSuggestionBinding,
        private val onSuggestionClick: (DestinationSuggestion) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(suggestion: DestinationSuggestion) {
            binding.destinationNameText.text = suggestion.name
            binding.destinationAddressText.text = suggestion.placeName
            binding.root.setOnClickListener {
                onSuggestionClick(suggestion)
            }
        }
    }

    private object DiffCallback : DiffUtil.ItemCallback<DestinationSuggestion>() {
        override fun areItemsTheSame(oldItem: DestinationSuggestion, newItem: DestinationSuggestion): Boolean {
            return oldItem.placeName == newItem.placeName && oldItem.lat == newItem.lat && oldItem.lon == newItem.lon
        }

        override fun areContentsTheSame(oldItem: DestinationSuggestion, newItem: DestinationSuggestion): Boolean {
            return oldItem == newItem
        }
    }
}
