FROM node:22

# Install Python, pip, and ffmpeg for yt-dlp / Instaloader processing
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Python tools required by the project
RUN pip3 install --break-system-packages \
    yt-dlp \
    instaloader

# Set working directory
WORKDIR /app

# Copy package files first for Docker layer caching
COPY package*.json ./

# Install Node dependencies
RUN npm install --legacy-peer-deps

# Copy source code (including cookies.txt since we removed it from .dockerignore)
COPY . .

# Build TypeScript
RUN npm run build

# Expose application port
EXPOSE 4000

# Start application
CMD ["npm", "start"]