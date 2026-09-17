package com.fabrica.smartfactory

import retrofit2.Call
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*

interface ApiService {

    @GET("api/products")
    fun getProducts(): Call<List<Product>>

    @PUT("api/products/{id}")
    fun updateStock(
        @Path("id") productId: Int,
        @Body request: ProductUpdateRequest
    ): Call<Product>

    companion object {
        // En emulador Android, 10.0.2.2 apunta al localhost de la computadora
        private const val BASE_URL = "http://10.0.2.2:8000/"

        fun create(): ApiService {
            val retrofit = Retrofit.Builder()
                .baseUrl(BASE_URL)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
            return retrofit.create(ApiService::class.java)
        }
    }
}
