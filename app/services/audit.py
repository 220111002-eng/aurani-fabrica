from sqlalchemy.orm import Session
from app import models

def log_audit(db: Session, entity_type: str, entity_id: int, action: str, details: str, user_name: str = "Sistema"):
    """Registra una entrada en el historial de auditoría de la fábrica."""
    log_entry = models.AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        user_name=user_name,
        details=details
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)

    # Si la acción fue de edición o cambio importante, generar también una alerta de modificación
    if action in ["ACTUALIZAR", "ELIMINAR"]:
        create_alert(
            db=db,
            alert_type="MODIFICACION_DETECTADA",
            message=f"[{user_name}] {action} en {entity_type} ID {entity_id}: {details}"
        )
    return log_entry

def create_alert(db: Session, alert_type: str, message: str):
    """Crea una alerta que puede ser notificada por correo o dashboard."""
    alert = models.Alert(
        alert_type=alert_type,
        message=message,
        status="PENDIENTE"
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert

def check_low_stock(db: Session, product: models.Product):
    """Verifica si el stock de un producto cayó por debajo del mínimo y dispara alerta."""
    if product.stock_quantity <= product.min_stock:
        message = f"¡ALERTA DE STOCK BAJO! El producto '{product.name}' (SKU: {product.sku}) tiene un inventario de {product.stock_quantity} unidades, inferior al mínimo de {product.min_stock}."
        
        # Verificar si ya existe una alerta pendiente idéntica para no duplicar
        existing = db.query(models.Alert).filter(
            models.Alert.alert_type == "STOCK_BAJO",
            models.Alert.message == message,
            models.Alert.status == "PENDIENTE"
        ).first()

        if not existing:
            create_alert(db, alert_type="STOCK_BAJO", message=message)
            log_audit(
                db=db,
                entity_type="Product",
                entity_id=product.id,
                action="ALERTA_STOCK_BAJO",
                details=f"Stock crítico alcanzado: {product.stock_quantity} <= {product.min_stock}",
                user_name="Motor de Inventario Automático"
            )
            return True
    return False
