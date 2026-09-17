package com.fabrica.smartfactory

import com.google.gson.annotations.SerializedName

data class Product(
    @SerializedName("id") val id: Int,
    @SerializedName("sku") val sku: String,
    @SerializedName("name") val name: String,
    @SerializedName("category") val category: String,
    @SerializedName("stock_quantity") val stockQuantity: Double,
    @SerializedName("min_stock") val minStock: Double,
    @SerializedName("unit_price") val unitPrice: Double
)

data class ProductUpdateRequest(
    @SerializedName("stock_quantity") val stockQuantity: Double,
    @SerializedName("user_name") val userName: String = "Operador Android"
)
