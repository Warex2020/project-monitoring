# Bereitstellung des IT-Projekt-Monitoring-Dashboards in Kubernetes

Diese Anleitung beschreibt, wie du das IT-Projekt-Monitoring-Dashboard in einer Offline-Umgebung in einem bestehenden Kubernetes-Cluster bereitstellen kannst.

## Voraussetzungen

- Zugang zu einem Kubernetes-Cluster
- kubectl installiert und konfiguriert
- Docker installiert (für die Image-Erstellung)
- Private Docker-Registry im Cluster oder offline zugängliche Registry
- Grundlegende Kenntnisse über Kubernetes-Konzepte (Deployments, Services, PersistentVolumes)

## Schritt 1: Docker-Image für die Offline-Umgebung vorbereiten

### Image lokal bauen

```bash
# Im Projektverzeichnis
docker build -t project-monitoring:latest .
```

### Image für die Offline-Umgebung vorbereiten

```bash
# Image taggen für deine private Registry
docker tag project-monitoring:latest <your-private-registry>/project-monitoring:latest

# Image als Datei speichern, wenn keine Registry verfügbar ist
docker save -o project-monitoring-image.tar <your-private-registry>/project-monitoring:latest
```

### Image in die Offline-Umgebung übertragen

Wenn du eine private Registry hast:
```bash
# Image in deine private Registry pushen
docker push <your-private-registry>/project-monitoring:latest
```

Alternativ, wenn du das Image als Datei übertragen musst:
1. Kopiere die `project-monitoring-image.tar` Datei in die Offline-Umgebung
2. Lade das Image in der Offline-Umgebung:
   ```bash
   docker load -i project-monitoring-image.tar
   ```

## Schritt 2: Kubernetes-Manifeste erstellen

Erstelle für deine Kubernetes-Umgebung die folgenden Manifest-Dateien:

### 1. Namespace (namespace.yaml)

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: project-monitoring
```

### 2. ConfigMap (configmap.yaml)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: project-monitoring-config
  namespace: project-monitoring
data:
  config.json: |
    {
      "allowedIps": [
        "127.0.0.1",
        "::1",
        "localhost",
        "192.168.1.0/24",
        "10.0.0.0/8"
      ],
      "server": {
        "port": 3420,
        "host": "0.0.0.0"
      },
      "projectSettings": {
        "defaultDeadlineDays": 30,
        "criticalDeadlineDays": 7,
        "statuses": [
          "on-track",
          "at-risk",
          "delayed",
          "completed"
        ]
      },
      "uiSettings": {
        "refreshInterval": 10000,
        "theme": "dark",
        "dateFormat": "dd.MM.yyyy",
        "timeFormat": "HH:mm:ss",
        "showCompletedProjects": true,
        "projectsPerPage": 6
      }
    }
  projects.json: |
    {}
```

### 3. PersistentVolumeClaim (pvc.yaml)

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: project-monitoring-data
  namespace: project-monitoring
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: standard  # Anpassen an deine Cluster-Storage-Class
```

### 4. Deployment (deployment.yaml)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: project-monitoring
  namespace: project-monitoring
  labels:
    app: project-monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: project-monitoring
  template:
    metadata:
      labels:
        app: project-monitoring
    spec:
      containers:
      - name: project-monitoring
        image: <your-private-registry>/project-monitoring:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3420
        env:
        - name: NODE_ENV
          value: "production"
        volumeMounts:
        - name: config-volume
          mountPath: /app/config
        - name: data-volume
          mountPath: /app/data
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 3420
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3420
          initialDelaySeconds: 5
          periodSeconds: 10
      volumes:
      - name: config-volume
        configMap:
          name: project-monitoring-config
      - name: data-volume
        persistentVolumeClaim:
          claimName: project-monitoring-data
```

### 5. Service (service.yaml)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: project-monitoring
  namespace: project-monitoring
spec:
  selector:
    app: project-monitoring
  ports:
  - port: 80
    targetPort: 3420
  type: ClusterIP
```

### 6. Ingress (ingress.yaml)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: project-monitoring
  namespace: project-monitoring
  annotations:
    # Füge hier spezifische Annotations für deinen Ingress-Controller hinzu
    # Beispiel für Nginx-Ingress:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: projects.your-domain.local  # Anpassen an deine Domain
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: project-monitoring
            port:
              number: 80
```

## Schritt 3: Anwendung in Kubernetes bereitstellen

```bash
# Namespace erstellen
kubectl apply -f namespace.yaml

# ConfigMap erstellen
kubectl apply -f configmap.yaml

# PersistentVolumeClaim erstellen
kubectl apply -f pvc.yaml

# Deployment erstellen
kubectl apply -f deployment.yaml

# Service erstellen
kubectl apply -f service.yaml

# Ingress erstellen (falls benötigt)
kubectl apply -f ingress.yaml
```

## Schritt 4: Überprüfen der Bereitstellung

```bash
# Prüfe, ob der Pod läuft
kubectl get pods -n project-monitoring

# Prüfe den Service
kubectl get svc -n project-monitoring

# Logs anzeigen
kubectl logs -n project-monitoring -l app=project-monitoring
```

## Schritt 5: Zugriff auf die Anwendung

### Über Ingress
Wenn du einen Ingress-Controller verwendest, greife über die konfigurierte Host-URL zu:
```
http://projects.your-domain.local
```

### Über Port-Forwarding (für Testzwecke)
```bash
kubectl port-forward -n project-monitoring svc/project-monitoring 3420:80
```
Dann greife im Browser auf `http://localhost:3420` zu.

## Anpassungen für Air-Gapped/Offline-Umgebungen

### Container-Image offline verwalten

Wenn dein Cluster komplett vom Internet getrennt ist:

1. **Image auf einem USB-Stick oder ähnlichem transportieren:**
   ```bash
   # Auf einem verbundenen System:
   docker save -o project-monitoring-image.tar <your-private-registry>/project-monitoring:latest
   
   # Auf dem Air-Gapped-System:
   docker load -i project-monitoring-image.tar
   docker tag <image-id> <your-private-registry>/project-monitoring:latest
   docker push <your-private-registry>/project-monitoring:latest
   ```

2. **Private Registry-Zugriffseinstellungen:**
   
   Wenn deine private Registry eine Authentifizierung erfordert, erstelle ein Secret:
   ```bash
   kubectl create secret docker-registry regcred \
     --namespace project-monitoring \
     --docker-server=<your-registry-server> \
     --docker-username=<your-username> \
     --docker-password=<your-password>
   ```
   
   Füge dann im Deployment das imagePullSecrets-Feld hinzu:
   ```yaml
   spec:
     template:
       spec:
         imagePullSecrets:
         - name: regcred
   ```

## Mehrere Instanzen und Hochverfügbarkeit

Für Hochverfügbarkeit in Produktionsumgebungen:

1. **Mehrere Replicas verwenden:**
   Ändere im Deployment die Anzahl der Replicas:
   ```yaml
   spec:
     replicas: 3  # Anpassen nach Bedarf
   ```

2. **Anti-Affinity-Regeln für die Pod-Verteilung:**
   Füge im Deployment eine podAntiAffinity-Regel hinzu:
   ```yaml
   spec:
     template:
       spec:
         affinity:
           podAntiAffinity:
             preferredDuringSchedulingIgnoredDuringExecution:
             - weight: 100
               podAffinityTerm:
                 labelSelector:
                   matchExpressions:
                   - key: app
                     operator: In
                     values:
                     - project-monitoring
                 topologyKey: kubernetes.io/hostname
   ```

3. **Horizontale Pod-Autoskalierung:**
   ```yaml
   apiVersion: autoscaling/v2
   kind: HorizontalPodAutoscaler
   metadata:
     name: project-monitoring
     namespace: project-monitoring
   spec:
     scaleTargetRef:
       apiVersion: apps/v1
       kind: Deployment
       name: project-monitoring
     minReplicas: 2
     maxReplicas: 5
     metrics:
     - type: Resource
       resource:
         name: cpu
         target:
           type: Utilization
           averageUtilization: 80
   ```

## Datenbackup

Um die Projektdaten zu sichern:

1. **Manuelles Backup der PVC:**
   ```bash
   # Pod für Backup erstellen
   kubectl run -n project-monitoring backup-pod --rm -i --tty \
     --image=alpine --restart=Never --overrides='
   {
     "spec": {
       "volumes": [
         {
           "name": "data-volume",
           "persistentVolumeClaim": {
             "claimName": "project-monitoring-data"
           }
         }
       ],
       "containers": [
         {
           "name": "backup-container",
           "image": "alpine",
           "command": ["tar"],
           "args": ["cf", "/tmp/backup.tar", "/data"],
           "volumeMounts": [
             {
               "mountPath": "/data",
               "name": "data-volume"
             }
           ]
         }
       ]
     }
   }' -- sleep 1

   # Backup vom Pod kopieren
   kubectl cp -n project-monitoring backup-pod:/tmp/backup.tar ./project-monitoring-backup.tar
   ```

2. **Automatisierte Backups mit CronJob:**
   Erstelle eine cronjob.yaml:
   ```yaml
   apiVersion: batch/v1
   kind: CronJob
   metadata:
     name: project-monitoring-backup
     namespace: project-monitoring
   spec:
     schedule: "0 2 * * *"  # Jeden Tag um 2 Uhr morgens
     jobTemplate:
       spec:
         template:
           spec:
             containers:
             - name: backup
               image: alpine
               command:
               - /bin/sh
               - -c
               - |
                 tar -cf /backup/project-monitoring-$(date +%Y%m%d).tar /data
               volumeMounts:
               - name: data-volume
                 mountPath: /data
                 readOnly: true
               - name: backup-volume
                 mountPath: /backup
             restartPolicy: OnFailure
             volumes:
             - name: data-volume
               persistentVolumeClaim:
                 claimName: project-monitoring-data
             - name: backup-volume
               persistentVolumeClaim:
                 claimName: project-monitoring-backup
   ```

## Fehlerbehebung

### Häufige Probleme und Lösungen

1. **Pod startet nicht:**
   ```bash
   kubectl describe pod -n project-monitoring -l app=project-monitoring
   kubectl logs -n project-monitoring -l app=project-monitoring
   ```

2. **Kein Zugriff auf die Anwendung:**
   - Prüfe, ob der Service läuft:
     ```bash
     kubectl get svc -n project-monitoring
     ```
   - Teste den Service direkt:
     ```bash
     kubectl run -i --tty --rm debug --image=curlimages/curl --restart=Never -- curl http://project-monitoring.project-monitoring.svc.cluster.local
     ```

3. **WebSocket-Verbindungsprobleme:**
   - Stelle sicher, dass dein Ingress-Controller WebSockets unterstützt
   - Füge bei nginx-ingress diese Annotation hinzu:
     ```yaml
     nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
     nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
     ```

## Ressourcen und weiterführende Informationen

- [Kubernetes-Dokumentation](https://kubernetes.io/docs/)
- [Ingress-Controller-Dokumentation](https://kubernetes.github.io/ingress-nginx/)
- [Kubernetes Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)