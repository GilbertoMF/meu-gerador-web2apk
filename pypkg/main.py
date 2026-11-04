import os
import wave
import struct
import math

from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.label import Label
from kivy.uix.button import Button
from kivy.core.window import Window
from kivy.core.audio import SoundLoader
from kivy.graphics import Color, Rectangle
from kivy.metrics import dp

Window.clearcolor = (0.08, 0.08, 0.08, 1)


def gerar_wav_beep(caminho, freq=440.0, duracao=0.15, taxa=22050, volume=0.5):
    n_amostras = int(taxa * duracao)
    with wave.open(caminho, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(taxa)
        for i in range(n_amostras):
            t = i / taxa
            valor = volume * math.sin(2 * math.pi * freq * t)
            amostra = int(valor * 32767)
            wav_file.writeframes(struct.pack('<h', amostra))


class TelaPrincipal(BoxLayout):
    def __init__(self, **kwargs):
        super().__init__(orientation='vertical', padding=dp(20), spacing=dp(16), **kwargs)

        with self.canvas.before:
            Color(0.08, 0.08, 0.08, 1)
            self.fundo = Rectangle(pos=self.pos, size=self.size)
        self.bind(pos=self._atualizar_fundo, size=self._atualizar_fundo)

        self.contador = 0
        self.mudo = False
        self.som = None

        self.app = App.get_running_app()
        self._preparar_audio()

        self.titulo = Label(
            text="App Simples",
            font_size='28sp',
            color=(1, 1, 1, 1),
            size_hint=(1, 0.15),
            bold=True
        )
        self.add_widget(self.titulo)

        self.label_contador = Label(
            text=f"Contagem: {self.contador}",
            font_size='32sp',
            color=(0.3, 0.9, 1, 1),
            size_hint=(1, 0.25)
        )
        self.add_widget(self.label_contador)

        linha_botoes = BoxLayout(
            orientation='horizontal',
            spacing=dp(12),
            size_hint=(1, 0.2)
        )

        btn_mais = Button(
            text="+1",
            font_size='24sp',
            size_hint=(0.5, 1),
            background_color=(0.2, 0.7, 0.3, 1),
            background_normal=''
        )
        btn_mais.bind(on_press=self.incrementar)
        btn_mais.height = dp(60)

        btn_menos = Button(
            text="-1",
            font_size='24sp',
            size_hint=(0.5, 1),
            background_color=(0.8, 0.3, 0.3, 1),
            background_normal=''
        )
        btn_menos.bind(on_press=self.decrementar)
        btn_menos.height = dp(60)

        linha_botoes.add_widget(btn_mais)
        linha_botoes.add_widget(btn_menos)
        self.add_widget(linha_botoes)

        btn_resetar = Button(
            text="Resetar",
            font_size='22sp',
            size_hint=(1, 0.15),
            background_color=(0.4, 0.4, 0.4, 1),
            background_normal=''
        )
        btn_resetar.bind(on_press=self.resetar)
        btn_resetar.height = dp(50)
        self.add_widget(btn_resetar)

        self.btn_mudo = Button(
            text="🔊 Som Ligado",
            font_size='20sp',
            size_hint=(1, 0.15),
            background_color=(0.3, 0.3, 0.5, 1),
            background_normal=''
        )
        self.btn_mudo.bind(on_press=self.alternar_mudo)
        self.btn_mudo.height = dp(50)
        self.add_widget(self.btn_mudo)

        espacador = Label(size_hint=(1, 0.1))
        self.add_widget(espacador)

    def _atualizar_fundo(self, *args):
        self.fundo.pos = self.pos
        self.fundo.size = self.size

    def _preparar_audio(self):
        try:
            pasta = self.app.user_data_dir
            caminho_wav = os.path.join(pasta, "beep.wav")
            if not os.path.exists(caminho_wav):
                gerar_wav_beep(caminho_wav)
            self.som = SoundLoader.load(caminho_wav)
        except Exception:
            self.som = None

    def tocar_som(self):
        if self.som and not self.mudo:
            try:
                self.som.stop()
                self.som.play()
            except Exception:
                pass

    def incrementar(self, instance):
        self.contador += 1
        self.label_contador.text = f"Contagem: {self.contador}"
        self.tocar_som()

    def decrementar(self, instance):
        self.contador -= 1
        self.label_contador.text = f"Contagem: {self.contador}"
        self.tocar_som()

    def resetar(self, instance):
        self.contador = 0
        self.label_contador.text = f"Contagem: {self.contador}"
        self.tocar_som()

    def alternar_mudo(self, instance):
        self.mudo = not self.mudo
        if self.mudo:
            self.btn_mudo.text = "🔇 Som Mudo"
        else:
            self.btn_mudo.text = "🔊 Som Ligado"


class App(App):
    def build(self):
        self.title = "App Simples"
        return TelaPrincipal()


if __name__ == "__main__":
    App().run()