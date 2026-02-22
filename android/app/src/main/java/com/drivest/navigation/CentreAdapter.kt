package com.drivest.navigation

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.drivest.navigation.data.TestCentre
import com.drivest.app.databinding.ItemTestCentreBinding

class CentreAdapter(
    private val onCentreClick: (TestCentre) -> Unit
) : ListAdapter<TestCentre, CentreAdapter.CentreViewHolder>(DiffCallback) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CentreViewHolder {
        val binding = ItemTestCentreBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return CentreViewHolder(binding, onCentreClick)
    }

    override fun onBindViewHolder(holder: CentreViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class CentreViewHolder(
        private val binding: ItemTestCentreBinding,
        private val onCentreClick: (TestCentre) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(centre: TestCentre) {
            binding.centreNameText.text = centre.name
            binding.centreAddressText.text = centre.address
            binding.root.setOnClickListener {
                onCentreClick(centre)
            }
        }
    }

    private object DiffCallback : DiffUtil.ItemCallback<TestCentre>() {
        override fun areItemsTheSame(oldItem: TestCentre, newItem: TestCentre): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: TestCentre, newItem: TestCentre): Boolean {
            return oldItem == newItem
        }
    }
}
