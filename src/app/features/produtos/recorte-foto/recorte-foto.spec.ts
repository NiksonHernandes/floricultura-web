import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ImageCropperComponent, ImageCroppedEvent, ImageTransform } from 'ngx-image-cropper';

import { RecorteFoto } from './recorte-foto';

/**
 * Componente de recorte (SPEC-M3.1 §3.2, T-M3.1-2, CA-3/CA-4/CA-5/CA-8/CA-9).
 *
 * Testa o WRAPPER (contrato de I/O + validação + envelope blob→File + config passada à lib),
 * NÃO o motor interno do `<image-cropper>` (o canvas real não é dirigido: o `ImageCroppedEvent`
 * é mockado com um `blob`, como orienta o §6).
 */

/** Probe do interno protegido — dirige o componente sem depender do canvas real da lib. */
interface Probe {
  aoRecortar(evento: ImageCroppedEvent): void;
  confirmar(): void;
  cancelar(): void;
  aumentarZoom(): void;
  diminuirZoom(): void;
  aoTransformar(t: ImageTransform): void;
  escala(): number;
  erro(): string | null;
  carregando(): boolean;
}

/** 1x1 PNG transparente (bytes reais) — carrega no cropper sem erro em headless. */
function pngFile(nome = 'origem.png'): File {
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return new File([arr], nome, { type: 'image/png' });
}

/** Monta um evento de recorte da lib (v9 traz `blob`) para dirigir o wrapper. */
function eventoRecorte(blob: Blob): ImageCroppedEvent {
  const box = { x1: 0, y1: 0, x2: 1600, y2: 1000 };
  return {
    blob,
    objectUrl: 'blob:recorte-fake',
    width: 1600,
    height: 1000,
    cropperPosition: { ...box },
    imagePosition: { ...box },
  };
}

describe('RecorteFoto (T-M3.1-2 — CA-3/4/5/8/9)', () => {
  let fixture: ComponentFixture<RecorteFoto>;
  let probe: Probe;

  function criar(file: File = pngFile()): void {
    fixture = TestBed.createComponent(RecorteFoto);
    fixture.componentRef.setInput('arquivo', file);
    fixture.detectChanges();
    probe = fixture.componentInstance as unknown as Probe;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RecorteFoto],
      providers: [provideNoopAnimations()],
    });
  });

  it('passa a config canônica ao <image-cropper> (16/10, blob/jpeg q85, 1920, onlyScaleDown) — CA-3/CA-5', () => {
    criar();
    const cropper = fixture.debugElement.query(By.directive(ImageCropperComponent))
      .componentInstance as ImageCropperComponent;

    expect(cropper.aspectRatio).toBeCloseTo(1.6, 5); // 16/10 = faixa do card (.vaso__planta)
    expect(cropper.maintainAspectRatio).toBeTrue();
    expect(cropper.output).toBe('blob');
    expect(cropper.format).toBe('jpeg');
    expect(cropper.imageQuality).toBe(85);
    expect(cropper.resizeToWidth).toBe(1920);
    expect(cropper.onlyScaleDown).toBeTrue();
    expect(cropper.hideResizeSquares).toBeTrue();
    expect(cropper.allowMoveImage).toBeTrue(); // pan por arraste
    expect(cropper.imageFile).toBeInstanceOf(File);
  });

  it('NÃO aplica rotação/flip e mantém a orientação por EXIF (default da lib) — CA-3/CA-4', () => {
    criar();
    const cropper = fixture.debugElement.query(By.directive(ImageCropperComponent))
      .componentInstance as ImageCropperComponent;

    // Só pan + zoom: transform sem rotação/flip; canvasRotation nunca é setado (EXIF fica no default).
    expect(cropper.transform?.rotate ?? 0).toBe(0);
    expect(cropper.transform?.flipH ?? false).toBeFalse();
    expect(cropper.transform?.flipV ?? false).toBeFalse();
    expect(cropper.canvasRotation ?? 0).toBe(0);

    // E não há controle de rotação/flip na UI (dono travou só pan+zoom).
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto.toLowerCase()).not.toContain('girar');
    expect(texto.toLowerCase()).not.toContain('rotacion');
  });

  it('renderiza os controles: zoom (slider + botões -/+) e ações Cancelar/Confirmar — CA-3/CA-9', () => {
    criar();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.recorte__slider')).toBeTruthy();
    expect(el.querySelectorAll('.recorte__zoom-btn').length).toBe(2);

    const acoes = Array.from(el.querySelectorAll('.recorte__acoes button')).map((b) =>
      b.textContent?.trim(),
    );
    expect(acoes.some((t) => t?.includes('Cancelar'))).toBeTrue();
    expect(acoes.some((t) => t?.includes('Confirmar'))).toBeTrue();
  });

  it('zoom altera transform.scale dentro de [1, 3], sem passar dos limites — CA-3', () => {
    criar();
    expect(probe.escala()).toBe(1);

    probe.aumentarZoom();
    expect(probe.escala()).toBeCloseTo(1.1, 5);

    // não desce abaixo do mínimo
    probe.diminuirZoom();
    probe.diminuirZoom();
    expect(probe.escala()).toBe(1);
  });

  it('pan/pinça da lib (transformChange) mantém a posição em sincronia — CA-3', () => {
    criar();
    probe.aoTransformar({ scale: 1.4, translateH: 12, translateV: -8, rotate: 0 });
    expect(probe.escala()).toBeCloseTo(1.4, 5);

    const cropper = fixture.debugElement.query(By.directive(ImageCropperComponent))
      .componentInstance as ImageCropperComponent;
    fixture.detectChanges();
    expect(cropper.transform?.translateH).toBe(12);
    expect(cropper.transform?.translateV).toBe(-8);
  });

  it('Confirmar emite recortado com File image/jpeg e nome derivado (.jpg) — CA-5', () => {
    criar(pngFile('Rosa Vermelha.png'));
    let emitido: File | undefined;
    fixture.componentInstance.recortado.subscribe((f) => (emitido = f));

    probe.aoRecortar(eventoRecorte(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })));
    probe.confirmar();

    expect(emitido).toBeInstanceOf(File);
    expect(emitido!.type).toBe('image/jpeg');
    expect(emitido!.name).toBe('Rosa Vermelha.jpg');
    expect(probe.erro()).toBeNull();
  });

  it('recorte > 5 MB NÃO emite e mostra erro local (guarda de tamanho) — CA-5/CA-8', () => {
    criar();
    let emitido = false;
    fixture.componentInstance.recortado.subscribe(() => (emitido = true));

    const grande = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
    Object.defineProperty(grande, 'size', { value: 5 * 1024 * 1024 + 1 });
    probe.aoRecortar(eventoRecorte(grande));
    probe.confirmar();

    expect(emitido).toBeFalse();
    expect(probe.erro()).toContain('5 MB');
  });

  it('Confirmar sem recorte disponível não emite e sinaliza erro — CA-8', () => {
    criar();
    let emitido = false;
    fixture.componentInstance.recortado.subscribe(() => (emitido = true));

    probe.confirmar();

    expect(emitido).toBeFalse();
    expect(probe.erro()).toBeTruthy();
  });

  it('Cancelar emite cancelado e não recorta nada — CA-8', () => {
    criar();
    let cancelou = false;
    let recortou = false;
    fixture.componentInstance.cancelado.subscribe(() => (cancelou = true));
    fixture.componentInstance.recortado.subscribe(() => (recortou = true));

    probe.cancelar();

    expect(cancelou).toBeTrue();
    expect(recortou).toBeFalse();
  });

  it('loadImageFailed → estado de erro visível e nada emitido — CA-8', () => {
    criar();
    const cropper = fixture.debugElement.query(By.directive(ImageCropperComponent))
      .componentInstance as ImageCropperComponent;
    let recortou = false;
    fixture.componentInstance.recortado.subscribe(() => (recortou = true));

    cropper.loadImageFailed.emit();
    fixture.detectChanges();

    expect(probe.erro()).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('.recorte__estado--erro')).toBeTruthy();
    expect(recortou).toBeFalse();
  });
});
