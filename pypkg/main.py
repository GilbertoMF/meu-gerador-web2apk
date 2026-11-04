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

def gerar_wav(caminho, freq=440.0, duracao=0.15, volume=0.4):
    try:
        taxa = 22050
        n_amostras = int(taxa * duracao)
        wav = wave.open(caminho, 'w')
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(taxa)
        for i in range(n_amostras):
            valor = volume * math.sin(2 * math.pi * freq * (i / taxa))
            amostra = int(valor * 32767)
            wav.writeframes(struct.pack('<h', amostra))
        wav.close()
        return True
    except Exception:
        return False


class TelaPrincipal(BoxLayout):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.orientation = 'vertical'
        self.padding = dp(20)
        self.spacing = dp(15)

        with self.canvas.before:
            Color(0.08, 0.08, 0.08, 1)
            self.bg = Rectangle(pos=self.pos, size=self.size)
        self.bind(pos=self._atualizar_bg, size=self._atualizar_bg)

        self.contador = 0
        self.mudo = False
        self.som = None

        app = App.get_running_app()
        try:
            caminho_wav = os.path.join(app.user_data_dir, 'clique.wav')
            if not os.path.exists(caminho_wav):
                gerar_wav(caminho_wav)
            self.som = SoundLoader.load(caminho_wav)
        except Exception:
            self.som = None

        self.titulo = Label(
            text='App Simples',
            font_size='26sp',
            color=(1, 1, 1, 1),
            size_hint=(1, 0.2),
            bold=True
        )
        self.add_widget(self.titulo)

        self.label_contador = Label(
            text='Toques: 0',
            font_size='22sp',
            color=(0.9, 0.9, 0.9, 1),
            size_hint=(1, 0.3)
        )
        self.add_widget(self.label_contador)

        self.botao_tocar = Button(
            text='TOCAR AQUI',
            font_size='20sp',
            size_hint=(1, 0.25),
            background_color=(0.2, 0.5, 0.9, 1),
            background_normal='',
            color=(1, 1, 1, 1)
        )
        self.botao_tocar.bind(on_press=self.ao_tocar)
        self.add_widget(self.botao_tocar)

        linha_inferior = BoxLayout(
            orientation='horizontal',
            spacing=dp(10),
            size_hint=(1, 0.25)
        )

        self.botao_reset = Button(
            text='RESETAR',
            font_size='18sp',
            background_color=(0.6, 0.2, 0.2, 1),
            background_normal='',
            color=(1, 1, 1, 1)
        )
        self.botao_reset.bind(on_press=self.resetar)
        linha_inferior.add_widget(self.botao_reset)

        self.botao_mudo = Button(
            text='SOM: ON',
            font_size='18sp',
            background_color=(0.3, 0.3, 0.3, 1),
            background_normal='',
            color=(1, 1, 1, 1)
        )
        self.botao_mudo.bind(on_press=self.alternar_mudo)
        linha_inferior.add_widget(self.botao_mudo)

        self.add_widget(linha_inferior)

        for widget in [self.botao_tocar, self.botao_reset, self.botao_mudo]:
            widget.size_hint_min_y = dp(48)

    def _atualizar_bg(self, *args):
        self.bg.pos = self.pos
        self.bg.size = self.size

    def ao_tocar(self, instance):
        self.contador += 1
        self.label_contador.text = f'Toques: {self.contador}'
        if not self.mudo and self.som:
            try:
                self.som.play()
            except Exception:
                pass

    def resetar(self, instance):
        self.contador = 0
        self.label_contador.text = 'Toques: 0'

    def alternar_mudo(self, instance):
        self.mudo = not self.mudo
        self.botao_mudo.text = 'SOM: OFF' if self.mudo else 'SOM: ON'


class App(App):
    def build(self):
        self.title = 'App Simples'
        return TelaPrincipal()


if __name__ == "__main__":
    App().run()