// mosquitto는 1단계(MVP) 범위 밖이라 docker-compose에서 기본적으로 꺼져 있다.
// MQTT_URL이 설정되지 않으면 publish를 조용히 무시하는 스텁으로 동작하고,
// 2~3단계에서 mosquitto를 켜고 MQTT_URL을 넣으면 자동으로 실제 브로커에 연결된다.
import mqtt, { type MqttClient } from "mqtt";

let client: MqttClient | null = null;

if (process.env.MQTT_URL) {
  client = mqtt.connect(process.env.MQTT_URL);
  client.on("error", (err) => {
    console.error("[mqtt] connection error", err.message);
  });
}

export function publish(topic: string, payload: unknown): void {
  if (!client) return;
  client.publish(topic, JSON.stringify(payload));
}
