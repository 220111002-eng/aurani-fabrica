import sys
import io

# Configurar stdout para soportar UTF-8 en Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from app.database import engine, Base, SessionLocal
from app import models, schemas
from app.services import ai_parser, audit
from fastapi.testclient import TestClient
from app.main import app

def run_tests():
    print("=== PROBANDO COMPONENTES DEL SISTEMA ===")
    
    # 1. Base de datos y tablas
    Base.metadata.create_all(bind=engine)
    print("[OK] Tablas de base de datos creadas exitosamente.")

    # 2. Cliente de prueba HTTP para los endpoints de FastAPI
    client = TestClient(app)

    # 3. Test Endpoint de Productos
    res_prod = client.get("/api/products")
    assert res_prod.status_code == 200
    products = res_prod.json()
    print(f"[OK] API /api/products retorno {len(products)} productos de inventario.")

    # 4. Test Ingesta de Cotizacion con IA
    test_quote = {
        "supplier_name": "Proveedora Industrial del Sur",
        "raw_text": "Cotizacion de Insumos:\n- 50 Cajas Empaque Especial a $35 c/u\n- 2 Rollo Cinta Industrial a $150 c/u\nTiempo de entrega: 48 horas.",
        "user_name": "Prueba de Ingesta"
    }
    res_quote = client.post("/api/quotes/process", json=test_quote)
    assert res_quote.status_code == 200
    quote_resp = res_quote.json()
    print(f"[OK] Ingesta con IA exitosa. Cotizacion ID #{quote_resp['id']} creada para '{quote_resp['supplier_name']}'. Total: ${quote_resp['total_amount']}")
    print(f"     Resumen IA: {quote_resp['ai_summary']}")

    # 5. Test Auditoria de Cambios y Alertas
    if products:
        p_id = products[0]['id']
        # Simular edicion de stock critico
        res_update = client.put(f"/api/products/{p_id}", json={
            "stock_quantity": 2.0,
            "user_name": "Prueba Auditoria"
        })
        assert res_update.status_code == 200
        print(f"[OK] Producto ID #{p_id} actualizado. Se registro la auditoria de cambio de stock a 2.0.")

    # 6. Test Endpoint de Alertas y Auditoria
    res_audit = client.get("/api/audit-logs")
    assert res_audit.status_code == 200
    logs = res_audit.json()
    print(f"[OK] /api/audit-logs retorno {len(logs)} registros en el historial de auditoria.")

    res_alerts = client.get("/api/alerts")
    assert res_alerts.status_code == 200
    alerts = res_alerts.json()
    print(f"[OK] /api/alerts retorno {len(alerts)} alertas registradas.")

    print("\n>>> TODAS LAS PRUEBAS DEL SISTEMA PASARON CORRECTAMENTE. <<<")

if __name__ == "__main__":
    run_tests()
