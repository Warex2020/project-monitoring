# Kubernetes Cluster Setup Guide (On-Premise)

Dieses Dokument beschreibt die Einrichtung eines eigenen Kubernetes-Clusters mit kubeadm.

## 1. Voraussetzungen

- Mehrere Server mit Linux (Ubuntu 20.04/22.04 oder CentOS 8 empfohlen)
- Mindestens 2GB RAM, 2 CPU Cores und 20GB Festplattenspeicher pro Node
- Netzwerkverbindung zwischen allen Nodes
- Root-Zugriff oder sudo-Rechte

## 2. System-Vorbereitung (auf allen Nodes)

```bash
# Swap deaktivieren
sudo swapoff -a
sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab

# Firewall-Konfiguration
sudo ufw allow 6443/tcp  # Kubernetes API Server
sudo ufw allow 2379:2380/tcp  # etcd
sudo ufw allow 10250/tcp  # Kubelet API
sudo ufw allow 10251/tcp  # kube-scheduler
sudo ufw allow 10252/tcp  # kube-controller-manager
sudo ufw allow 10255/tcp  # Read-only Kubelet API
sudo ufw allow 8472/udp   # Flannel overlay network
sudo ufw allow 179/tcp    # BGP (Calico networking)

# Kernel-Module laden
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter

# sysctl-Parameter konfigurieren
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

sudo sysctl --system
```

## 3. Container-Runtime installieren (auf allen Nodes)

```bash
# Containerd installieren
sudo apt-get update
sudo apt-get install -y containerd

# Containerd konfigurieren
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml

# SystemdCgroup aktivieren
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g' /etc/containerd/config.toml

# Containerd neustarten
sudo systemctl restart containerd
sudo systemctl enable containerd
```

## 4. Kubernetes-Komponenten installieren (auf allen Nodes)

```bash
# Kubernetes-Repo hinzufügen
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl

# GPG-Key für Google Cloud paket repository
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-archive-keyring.gpg

# Kubernetes-Repository hinzufügen
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-archive-keyring.gpg] https://apt.kubernetes.io/ kubernetes-xenial main" | sudo tee /etc/apt/sources.list.d/kubernetes.list

# Kubernetes-Komponenten installieren
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl
```

## 5. Master-Node initialisieren (nur auf dem Master)

```bash
# Master-Node initialisieren
sudo kubeadm init --pod-network-cidr=10.244.0.0/16 --kubernetes-version=v1.27.0

# kubeconfig für regulären Benutzer konfigurieren
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# Pod-Netzwerk-Addon installieren (Calico)
kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml

# Join-Command für Worker-Nodes anzeigen
kubeadm token create --print-join-command
```

## 6. Worker-Nodes zum Cluster hinzufügen (auf jedem Worker)

```bash
# Führe den Join-Command vom Master aus
sudo kubeadm join <master-ip>:6443 --token <token> --discovery-token-ca-cert-hash <hash>
```

## 7. Cluster-Status prüfen (auf dem Master)

```bash
kubectl get nodes
kubectl get pods --all-namespaces
```

## 8. Storage-Klasse für persistente Volumes konfigurieren

```bash
# Local PV-Verzeichnisse erstellen
sudo mkdir -p /mnt/data/project-monitoring/config
sudo mkdir -p /mnt/data/project-monitoring/sessions
sudo chmod -R 777 /mnt/data
```

## 9. Nginx Ingress Controller installieren (optional)

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
```

## 10. Cluster-Maintenance

```bash
# Cluster-Upgrade (Master zuerst)
sudo apt-get update
sudo apt-get install -y --allow-change-held-packages kubeadm=1.27.x-00
sudo kubeadm upgrade plan
sudo kubeadm upgrade apply v1.27.x

# kubelet und kubectl upgraden
sudo apt-get update
sudo apt-get install -y --allow-change-held-packages kubelet=1.27.x-00 kubectl=1.27.x-00
sudo systemctl daemon-reload
sudo systemctl restart kubelet

# Node-Drain für Wartungsarbeiten
kubectl drain <node-name> --ignore-daemonsets

# Node wieder aktivieren
kubectl uncordon <node-name>
```