FROM surnet/alpine-node-wkhtmltopdf:8.11.3-0.12.5-full

# By default image is built using NODE_ENV=production.
# You may want to customize it:
#
#   --build-arg NODE_ENV=development
#
# See https://docs.docker.com/engine/reference/commandline/build/#set-build-time-variables-build-arg
#
ARG NODE_ENV=production
ARG APP_PORT=8080
ENV NODE_ENV=${NODE_ENV} APP_PORT=${APP_PORT} APP_ROOT=/home/app

# Expose port to the Docker host, so we can access it from the outside.
EXPOSE $APP_PORT

# The main command to run when the container starts.
CMD ["node", "index.js"]

WORKDIR $APP_ROOT

# Install Gemfile dependencies.
COPY package.json package-lock.json $APP_ROOT/
RUN npm install

# Copy application sources.
COPY . $APP_ROOT
