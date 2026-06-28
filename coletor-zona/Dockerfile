# ── Estágio de build: compila e gera o fat jar (baixa Maven + protoc) ──
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

# Cache de dependências
COPY pom.xml .
RUN mvn -B -q dependency:go-offline || true

# Código + protos
COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ── Estágio de runtime: só o JRE + o jar ──
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/coletor-zona-1.0.0.jar app.jar

# Portas: ZoneCollector (gRPC) e serviço interno de replicação
EXPOSE 50051 60051

ENTRYPOINT ["java", "-jar", "app.jar"]
