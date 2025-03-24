# Kubernetes Deployment Guide

Diese Anleitung erklärt, wie du die Project-Monitoring-Anwendung in einem Kubernetes-Cluster deployen kannst.

## 1. Vorbereitung

Stelle sicher, dass du folgende Tools installiert hast:
- Docker
- kubectl
- Zugriff auf einen Kubernetes-Cluster

## 2. Docker-Image erstellen

```bash
# Im Projektverzeichnis
docker build -t project-monitoring:latest -f Dockerfile.kubernetes .

# Optional: Image taggen, wenn du eine private Registry verwendest
docker tag project-monitoring:latest your-registry.com/project-monitoring:latest
docker push your-registry.com/project-monitoring:latest
```

## 3. Verzeichnisstruktur für Kubernetes-Manifeste

Lege die YAML-Dateien in einem Verzeichnis an:

```bash
mkdir -p kubernetes
cd kubernetes

# Kopiere alle YAML-Dateien in dieses Verzeichnis
# deployment.yaml, service.yaml, configmap.yaml, persistent-volumes.yaml, ingress.yaml, kustomization.yaml
```

## 4. Persistente Volumes vorbereiten

Stelle sicher, dass die Verzeichnisse für persistente Daten auf dem Host existieren:

```bash
# Auf jedem Worker-Node ausführen, wo die Pods laufen können
sudo mkdir -p /mnt/data/project-monitoring/config
sudo mkdir -p /mnt/data/project-monitoring/sessions
sudo chmod -R 777 /mnt/data/project-monitoring
```

## 5. Anwendung deployen

```bash
# Optional: Eigenen Namespace erstellen
kubectl create namespace project-monitoring

# Anwendung mit kustomize deployen
kubectl apply -k kubernetes/ [-n project-monitoring]

# Status überprüfen
kubectl get pods [-n project-monitoring]
kubectl get svc [-n project-monitoring]
kubectl get pvc [-n project-monitoring]
```

## 6. Ingress konfigurieren

Stelle sicher, dass ein Ingress-Controller im Cluster läuft und die Domain in deinem DNS-System konfiguriert ist.

```bash
# Status des Ingress überprüfen
kubectl get ingress [-n project-monitoring]
```

## 7. Logs und Debugging

```bash
# Pods anzeigen
kubectl get pods [-n project-monitoring]

# Logs anzeigen
kubectl logs -f deployment/project-monitoring [-n project-monitoring]

# Shell im Pod öffnen
kubectl exec -it deployment/project-monitoring -- /bin/sh

# Beschreibung des Pods für Debugging
kubectl describe pod <pod-name> [-n project-monitoring]
```

## 8. Skalierung

```bash
# Horizontal skalieren (mehr Pods)
kubectl scale deployment project-monitoring --replicas=3 [-n project-monitoring]
```

## 9. Updates und Rollbacks

```bash
# Update auf neue Version (wenn neues Image gebaut wurde)
kubectl set image deployment/project-monitoring project-monitoring=project-monitoring:v2 [-n project-monitoring]

# Rollout-Status überprüfen
kubectl rollout status deployment/project-monitoring [-n project-monitoring]

# Rollback bei Problemen
kubectl rollout undo deployment/project-monitoring [-n project-monitoring]
```

## 10. Konfiguration aktualisieren

```bash
# ConfigMap aktualisieren
kubectl edit configmap project-monitoring-config [-n project-monitoring]

# Pod neu starten, um Änderungen zu übernehmen
kubectl rollout restart deployment project-monitoring [-n project-monitoring]
```

## 11. Ressourcennutzung überwachen

```bash
# Mit Metrics-Server (muss im Cluster installiert sein)
kubectl top pods [-n project-monitoring]
kubectl top nodes
```

## 12. Aufräumen (bei Bedarf)

```bash
# Alle Ressourcen der Anwendung löschen
kubectl delete -k kubernetes/ [-n project-monitoring]

# Namespace löschen (falls erstellt)
kubectl delete namespace project-monitoring
```