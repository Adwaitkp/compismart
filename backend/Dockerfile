FROM node:22

# Install Python, pip and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Python tools
RUN pip3 install --break-system-packages yt-dlp instaloader

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

EXPOSE 10000

CMD ["npm", "start"]