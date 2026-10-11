"""Generate the prototype's Mandarin narration with the official Qwen HF Space.

Usage: python3 scripts/generate-narration.py
Requires curl; no API key. Public Space availability/quota may vary.
Only story text and style instructions are sent, never camera/motion recordings.
"""
import argparse
import datetime
import json
import pathlib
import subprocess
import wave

ROOT = pathlib.Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--book', default='moon-book-watercolor-v1')
parser.add_argument('--model-size', choices=['0.6B', '1.7B'], default='0.6B')
args = parser.parse_args()
BOOK = ROOT / 'story-assets' / args.book
MANIFEST = BOOK / 'manifest.json'
HOST = 'https://qwen-qwen3-tts.hf.space'
MODEL = 'Qwen/Qwen3-TTS-12Hz-' + args.model_size + '-CustomVoice'
STYLE = '用温柔、亲切、富有感情的女声给小朋友讲睡前绘本故事。语速稍慢，吐字清晰，轻柔而有自然起伏，在逗号和句号处自然停顿。'


def curl(url, payload=None):
    args = ['curl', '-fsSL', '--max-time', '180', url]
    if payload is not None:
        args += ['-H', 'Content-Type: application/json', '--data-binary', '@-']
    return subprocess.check_output(args, input=None if payload is None else json.dumps(payload, ensure_ascii=False).encode('utf-8')).decode('utf-8')


def main():
    manifest = json.loads(MANIFEST.read_text())
    (BOOK / 'audio').mkdir(exist_ok=True)
    metadata_file = BOOK / 'audio' / 'generation.json'
    previous = json.loads(metadata_file.read_text()) if metadata_file.exists() else {}
    previous_pages = {p['pageId']: p for p in previous.get('pages', [])}
    records = []
    for page in manifest['bodyPages'] + [manifest['endingPage']]:
        destination = BOOK / 'audio' / (page['id'] + '.wav')
        provenance = previous_pages.get(page['id'], {})
        if destination.exists() and provenance.get('text', page['text']) != page['text']:
            raise RuntimeError('Text changed; remove the old audio before regenerating: ' + str(destination))
        # Existing files are the current prototype's previously generated takes.
        # Remove an old take before rerunning if its text/style has changed.
        if not destination.exists():
            print('Generating ' + page['id'], flush=True)
            call = json.loads(curl(HOST + '/gradio_api/call/generate_custom_voice', {'data': [page['text'], 'Chinese', 'Serena', STYLE, args.model_size]}))
            result = curl(HOST + '/gradio_api/call/generate_custom_voice/' + call['event_id'])
            complete = next((chunk for chunk in result.split('\n\n') if chunk.startswith('event: complete\n')), None)
            if complete is None:
                raise RuntimeError('Generation did not complete: ' + result[:1000])
            audio, status = json.loads(complete.split('data: ', 1)[1])
            if not audio or not audio.get('url'):
                raise RuntimeError(status)
            subprocess.run(['curl', '-fsSL', '--max-time', '60', audio['url'], '-o', str(destination)], check=True)
            provenance = {'model': MODEL, 'space': 'Qwen/Qwen3-TTS', 'speaker': 'Serena', 'style': STYLE}
        with wave.open(str(destination)) as wav:
            duration = wav.getnframes() / wav.getframerate()
            if duration < 1:
                raise RuntimeError('Generated audio is too short')
        page['audioUrl'] = 'audio/' + destination.name
        page['audioText'] = page['text']
        records.append({**provenance, 'pageId': page['id'], 'text': page['text'], 'audioUrl': page['audioUrl'], 'durationSeconds': round(duration, 3)})
        print(page['id'] + ': ' + str(round(duration, 2)) + ' seconds', flush=True)
    manifest['narration'] = {'family': 'Qwen3-TTS', 'voice': 'Serena (synthetic)', 'language': 'Chinese', 'generationStatus': 'complete'}
    metadata_file.write_text(json.dumps({**previous, 'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'pages': records}, ensure_ascii=False, indent=2) + '\n')
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print('All narration saved. Run npm run prepare-assets to refresh the player.', flush=True)


if __name__ == '__main__':
    main()
