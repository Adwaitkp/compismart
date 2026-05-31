FROM node:22

# Install Python, ffmpeg and pip
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg

# Install yt-dlp and instaloader (Python tools)
RUN pip3 install yt-dlp instaloader

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 10000

CMD ["npm", "start"]
