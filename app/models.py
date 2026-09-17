import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, index=True)
    phone = Column(String, nullable=True)
    contact_person = Column(String, nullable=True)

    products = relationship("Product", back_populates="supplier")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String, unique=True, index=True)
    name = Column(String, index=True)
    category = Column(String, default="General")
    stock_quantity = Column(Float, default=0.0)
    min_stock = Column(Float, default=10.0)
    unit_price = Column(Float, default=0.0)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    supplier = relationship("Supplier", back_populates="products")

class Quote(Base):
    __tablename__ = "quotes"

    id = Column(Integer, primary_key=True, index=True)
    supplier_name = Column(String, index=True)
    quote_number = Column(String, nullable=True)
    raw_content = Column(Text, nullable=True)
    ai_summary = Column(Text, nullable=True)
    total_amount = Column(Float, default=0.0)
    status = Column(String, default="RECIBIDA") # RECIBIDA, APROBADA, RECHAZADA
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    items = relationship("QuoteItem", back_populates="quote", cascade="all, delete-orphan")

class QuoteItem(Base):
    __tablename__ = "quote_items"

    id = Column(Integer, primary_key=True, index=True)
    quote_id = Column(Integer, ForeignKey("quotes.id"))
    product_name = Column(String)
    quantity = Column(Float)
    unit_price = Column(Float)
    total_price = Column(Float)

    quote = relationship("Quote", back_populates="items")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String, index=True) # Product, Quote, Supplier
    entity_id = Column(Integer, nullable=True)
    action = Column(String) # CREAR, ACTUALIZAR, ELIMINAR, INGESTION_IA
    user_name = Column(String, default="Sistema/Operador")
    details = Column(Text) # Descripción clara del cambio (Valor anterior -> Valor nuevo)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    alert_type = Column(String, index=True) # STOCK_BAJO, MODIFICACION_SUSPECHOSA, IA_INFO
    message = Column(Text)
    status = Column(String, default="PENDIENTE") # PENDIENTE, ATENDIDA
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
