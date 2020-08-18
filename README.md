# Root updater

Uploads deposit and withdrawal events from tornado instances into farmer tree

## Usage with docker

```shell script
wget https://raw.githubusercontent.com/tornadocash/root-updater/master/docker-compose.yml
vi docker-compose.yml # update env vars
docker-compose up -d
```

## Usage for development

```shell script
npm i
cp .env.example .env
npm run start
```

Caches events from both farmer and tornado cash instances

Will run once, needs to be put on cron or other scheduler
