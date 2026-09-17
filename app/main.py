import os
from typing import List
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import engine, Base, get_db
from app.services import audit, ai_parser

# Crear tablas
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Sistema Inteligente de Gestión de Cotizaciones e Inventario",
    description="Backend API para automatización de la fábrica con Ingesta IA, Auditoría y Alertas.",
    version="1.0.0"
)

# Servir archivos estáticos del frontend
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.on_event("startup")
def startup_event():
    """Poblar datos de demostración iniciales si la base de datos está vacía."""
    db = next(get_db())
    if db.query(models.Product).count() == 0:
        seed_factory_data(db)

def seed_factory_data(db: Session):
    # Proveedores iniciales
    p1 = models.Supplier(name="Aceros del Norte S.A.", email="ventas@acerosnorte.com", phone="81-8000-1122", contact_person="Ing. Carlos Ramos")
    p2 = models.Supplier(name="Empaques e Insumos Industriales", email="cotizaciones@empaquesind.com", phone="55-5555-4321", contact_person="Lic. Ana Morales")
    db.add_all([p1, p2])
    db.commit()

    # Productos con diferentes niveles de stock
    prods = [
        models.Product(sku="MAT-001", name="Placa de Acero Calibre 10", category="Materias Primas", stock_quantity=45.0, min_stock=15.0, unit_price=1250.0, supplier_id=p1.id),
        models.Product(sku="MAT-002", name="Tornillo Hexagonal 1/2 x 2", category="Fijación", stock_quantity=8.0, min_stock=50.0, unit_price=4.5, supplier_id=p2.id), # Stock crítico!
        models.Product(sku="MAT-003", name="Caja de Cartón Corrugado 40x40", category="Empaque", stock_quantity=120.0, min_stock=100.0, unit_price=18.0, supplier_id=p2.id),
        models.Product(sku="INS-004", name="Aceite Lubricante Sintético 20L", category="Mantenimiento", stock_quantity=3.0, min_stock=5.0, unit_price=2400.0, supplier_id=p1.id), # Stock crítico!
    ]
    db.add_all(prods)
    db.commit()

    # Cotización de demostración procesada por IA
    quote_data = ai_parser.parse_quote_content(
        supplier_name="Aceros del Norte S.A.",
        raw_text="Estimados, adjunto cotización:\n- 10 Placas de Acero Calibre 10 a $1200 c/u\n- 5 Tambos Aceite Lubricante 20L a $2300 c/u\nDescuento por volumen incluido."
    )
    quote = models.Quote(
        supplier_name=quote_data["supplier_name"],
        quote_number=quote_data["quote_number"],
        raw_content="Cotización inicial recibida por correo.",
        ai_summary=quote_data["ai_summary"],
        total_amount=quote_data["total_amount"],
        status="RECIBIDA"
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    for item in quote_data["items"]:
        db.add(models.QuoteItem(
            quote_id=quote.id,
            product_name=item["product_name"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            total_price=item["total_price"]
        ))
    db.commit()

    # Verificar stock bajo para generar alertas iniciales
    for p in prods:
        audit.check_low_stock(db, p)

    # Registrar en auditoría
    audit.log_audit(db, "Sistema", 0, "INICIALIZACION", "Base de datos inicializada con productos y cotización demo.", "Sistema Central")

# --- ENDPOINTS ---

@app.get("/", response_class=HTMLResponse)
def read_root():
    return FileResponse(os.path.join(static_dir, "index.html"))

@app.get("/api/products", response_model=List[schemas.ProductOut])
def get_products(db: Session = Depends(get_db)):
    return db.query(models.Product).all()

@app.post("/api/products", response_model=schemas.ProductOut)
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):
    db_prod = models.Product(**product.dict())
    db.add(db_prod)
    db.commit()
    db.refresh(db_prod)

    audit.log_audit(db, "Product", db_prod.id, "CREAR", f"Nuevo producto creado: {db_prod.name} (SKU: {db_prod.sku})", "Operador Fábrica")
    audit.check_low_stock(db, db_prod)
    return db_prod

@app.put("/api/products/{product_id}", response_model=schemas.ProductOut)
def update_product(product_id: int, product_update: schemas.ProductUpdate, db: Session = Depends(get_db)):
    db_prod = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not db_prod:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    changes = []
    user_name = product_update.user_name or "Operador Fábrica"

    if product_update.name is not None and product_update.name != db_prod.name:
        changes.append(f"Nombre: '{db_prod.name}' -> '{product_update.name}'")
        db_prod.name = product_update.name

    if product_update.stock_quantity is not None and product_update.stock_quantity != db_prod.stock_quantity:
        changes.append(f"Stock: {db_prod.stock_quantity} -> {product_update.stock_quantity}")
        db_prod.stock_quantity = product_update.stock_quantity

    if product_update.min_stock is not None and product_update.min_stock != db_prod.min_stock:
        changes.append(f"Stock Mínimo: {db_prod.min_stock} -> {product_update.min_stock}")
        db_prod.min_stock = product_update.min_stock

    if product_update.unit_price is not None and product_update.unit_price != db_prod.unit_price:
        changes.append(f"Precio Unitario: ${db_prod.unit_price} -> ${product_update.unit_price}")
        db_prod.unit_price = product_update.unit_price

    db.commit()
    db.refresh(db_prod)

    if changes:
        details = ", ".join(changes)
        audit.log_audit(db, "Product", db_prod.id, "ACTUALIZAR", details, user_name)

    audit.check_low_stock(db, db_prod)
    return db_prod

@app.post("/api/quotes/process", response_model=schemas.QuoteOut)
def process_quote(quote_in: schemas.QuoteCreateText, db: Session = Depends(get_db)):
    """Procesa el contenido de un correo o cotización con IA y la guarda en la base de datos."""
    parsed_data = ai_parser.parse_quote_content(quote_in.supplier_name, quote_in.raw_text)

    db_quote = models.Quote(
        supplier_name=parsed_data["supplier_name"],
        quote_number=parsed_data["quote_number"],
        raw_content=quote_in.raw_text,
        ai_summary=parsed_data["ai_summary"],
        total_amount=parsed_data["total_amount"],
        status="RECIBIDA"
    )
    db.add(db_quote)
    db.commit()
    db.refresh(db_quote)

    for item in parsed_data["items"]:
        db_item = models.QuoteItem(
            quote_id=db_quote.id,
            product_name=item["product_name"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            total_price=item["total_price"]
        )
        db.add(db_item)
    
    db.commit()
    db.refresh(db_quote)

    audit.log_audit(
        db,
        "Quote",
        db_quote.id,
        "INGESTION_IA",
        f"Cotización procesada con IA para '{db_quote.supplier_name}'. Total: ${db_quote.total_amount:,.2f}",
        quote_in.user_name or "Ingesta IA"
    )

    return db_quote

@app.get("/api/quotes", response_model=List[schemas.QuoteOut])
def get_quotes(db: Session = Depends(get_db)):
    return db.query(models.Quote).order_by(models.Quote.created_at.desc()).all()

@app.get("/api/audit-logs", response_model=List[schemas.AuditLogOut])
def get_audit_logs(db: Session = Depends(get_db)):
    return db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).all()

@app.get("/api/alerts", response_model=List[schemas.AlertOut])
def get_alerts(db: Session = Depends(get_db)):
    return db.query(models.Alert).order_by(models.Alert.created_at.desc()).all()

@app.post("/api/alerts/{alert_id}/read")
def mark_alert_read(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if alert:
        alert.status = "ATENDIDA"
        db.commit()
    return {"status": "ok"}
