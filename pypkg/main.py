from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.label import Label
from kivy.core.window import Window

Window.clearcolor = (0.08, 0.08, 0.09, 1)

class Root(BoxLayout):
    def __init__(self, **kw):
        super().__init__(**kw)
        self.add_widget(Label(text="Teste Python APK", font_size='24sp'))

class TestApp(App):
    def build(self):
        return Root()

if __name__ == "__main__":
    TestApp().run()
