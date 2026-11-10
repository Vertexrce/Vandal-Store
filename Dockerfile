FROM nginx:alpine

# Railway injects PORT at runtime; 8080 is a safe local/default value.
ENV PORT=8080

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY index.html /usr/share/nginx/html/index.html
COPY styles.css /usr/share/nginx/html/styles.css
COPY script.js /usr/share/nginx/html/script.js
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 8080
