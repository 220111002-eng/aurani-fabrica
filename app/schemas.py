from pydantic import BaseModel
from typing import List, Optional
import datetime

class ProductBase(BaseModel):
    sku: str
    name: str
    category: Optional[str] = "General"
    stock_quantity: float
    min_stock: float
    unit_price: float
    supplier_id: Optional[int] = None

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    stock_quantity: Optional[float] = None
    min_stock: Optional[float] = None
    unit_price: Optional[float] = None
    supplier_id: Optional[int] = None
    user_name: Optional[str] = "Operador Fábrica"

class ProductOut(ProductBase):
    id: int
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

class SupplierBase(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    contact_person: Optional[str] = None

class SupplierOut(SupplierBase):
    id: int

    class Config:
        from_attributes = True

class QuoteItemBase(BaseModel):
    product_name: str
    quantity: float
    unit_price: float

class QuoteCreateText(BaseModel):
    supplier_name: str
    raw_text: str
    user_name: Optional[str] = "Ingesta Automática Correo/IA"

class QuoteOut(BaseModel):
    id: int
    supplier_name: str
    quote_number: Optional[str]
    ai_summary: Optional[str]
    total_amount: float
    status: str
    created_at: datetime.datetime
    items: List[QuoteItemBase] = []

    class Config:
        from_attributes = True

class AuditLogOut(BaseModel):
    id: int
    entity_type: str
    entity_id: Optional[int]
    action: str
    user_name: str
    details: str
    timestamp: datetime.datetime

    class Config:
        from_attributes = True

class AlertOut(BaseModel):
    id: int
    alert_type: str
    message: str
    status: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True
