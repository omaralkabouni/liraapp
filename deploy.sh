#!/bin/bash
# =============================================================
# 🪙 الليرة الآن — Deploy Script for Linux VPS
# Run: chmod +x deploy.sh && ./deploy.sh
# =============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

DOMAIN="${DOMAIN:-liranow.sy}"
EMAIL="${CERTBOT_EMAIL:-admin@liranow.sy}"
APP_DIR="/opt/liranow"

echo -e "${CYAN}================================================${NC}"
echo -e "${YELLOW}  🪙 الليرة الآن — Deploy Script${NC}"
echo -e "${CYAN}================================================${NC}"

# ---- Check prerequisites ----
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}❌ $1 غير مثبت. يرجى تثبيته أولاً.${NC}"
        exit 1
    fi
}

echo -e "${BLUE}▶ التحقق من المتطلبات...${NC}"
check_command docker
check_command docker-compose || check_command "docker compose"
echo -e "${GREEN}✅ جميع المتطلبات موجودة${NC}"

# ---- Create .env if not exists ----
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️ ملف .env غير موجود، نسخ من .env.example...${NC}"
    cp .env.example .env
    
    # Generate random secrets
    JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n' | tr -d '/')
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n' | tr -d '/')
    
    sed -i "s/CHANGE_THIS_TO_A_VERY_LONG_RANDOM_SECRET_STRING_AT_LEAST_64_CHARS/${JWT_SECRET}/" .env
    sed -i "s/CHANGE_THIS_STRONG_PASSWORD_2026/${POSTGRES_PASSWORD}/" .env
    sed -i "s/CHANGE_THIS_REDIS_PASSWORD_2026/${REDIS_PASSWORD}/" .env
    
    echo -e "${GREEN}✅ تم إنشاء .env بكلمات مرور عشوائية آمنة${NC}"
    echo -e "${YELLOW}⚠️ قم بتعديل .env بإعداداتك قبل المتابعة!${NC}"
    echo ""
    echo -e "  nano .env"
    echo ""
    read -p "هل قمت بتعديل .env؟ اضغط ENTER للمتابعة..."
fi

# ---- Create required directories ----
echo -e "${BLUE}▶ إنشاء المجلدات المطلوبة...${NC}"
mkdir -p \
    "${APP_DIR}/postgres_data" \
    "${APP_DIR}/redis_data" \
    "${APP_DIR}/backend_logs" \
    "${APP_DIR}/nginx_logs" \
    "${APP_DIR}/certbot_data" \
    "${APP_DIR}/certbot_certs" \
    "${APP_DIR}/nginx_ssl"

# ---- SSL Setup ----
echo -e "${BLUE}▶ إعداد شهادة SSL...${NC}"
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    echo -e "${YELLOW}جاري الحصول على شهادة SSL من Let's Encrypt...${NC}"
    
    # Start nginx temporarily for challenge
    docker-compose up -d nginx
    sleep 5
    
    docker-compose run --rm certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "${EMAIL}" \
        --agree-tos \
        --no-eff-email \
        -d "${DOMAIN}" \
        -d "www.${DOMAIN}"
    
    echo -e "${GREEN}✅ تم الحصول على شهادة SSL بنجاح${NC}"
else
    echo -e "${GREEN}✅ شهادة SSL موجودة بالفعل${NC}"
fi

# ---- Build & Start Services ----
echo -e "${BLUE}▶ بناء وتشغيل الخدمات...${NC}"
docker-compose build --no-cache
docker-compose up -d

echo -e "${BLUE}▶ انتظار بدء الخدمات...${NC}"
sleep 15

# ---- Health Check ----
echo -e "${BLUE}▶ التحقق من صحة الخدمات...${NC}"
HEALTH=$(curl -sf http://localhost/health 2>/dev/null || echo "failed")
if echo "$HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ API يعمل بشكل صحيح${NC}"
else
    echo -e "${YELLOW}⚠️ API قد لا يزال يبدأ، تحقق من: docker-compose logs backend${NC}"
fi

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  🎉 تم النشر بنجاح!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "  🖥️  لوحة التحكم: ${CYAN}https://${DOMAIN}/admin/${NC}"
echo -e "  📡  API:          ${CYAN}https://${DOMAIN}/api/v1/prices${NC}"
echo -e "  💡  pgAdmin:      ${CYAN}SSH tunnel على المنفذ 5050${NC}"
echo ""
echo -e "  📋  الأوامر المفيدة:"
echo -e "    ${YELLOW}docker-compose logs -f backend${NC}   # logs الـ API"
echo -e "    ${YELLOW}docker-compose restart backend${NC}   # إعادة تشغيل API"
echo -e "    ${YELLOW}docker-compose down${NC}              # إيقاف كل الخدمات"
echo ""
