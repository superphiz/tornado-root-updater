FROM node:12
WORKDIR /app

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install zkutil

COPY package.json yarn.lock ./
RUN yarn && yarn cache clean --force
COPY . .

COPY --from=tornadocash/tornado-trees \
    /app/artifacts/circuits/BatchTreeUpdate.params \
    /app/artifacts/circuits/BatchTreeUpdate \
    /app/artifacts/circuits/BatchTreeUpdate.dat \
    /app/artifacts/circuits/BatchTreeUpdate.r1cs \
    ./snarks/

CMD ["yarn", "start"]
