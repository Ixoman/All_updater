export interface RestoreVerificationInput {
    sequenceNumber: number;
    description: string;
}

export function isValidRestoreSequence(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function parseRestoreSequence(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const parsed = Number(trimmed);
    return isValidRestoreSequence(parsed) ? parsed : null;
}

export function validateRestoreVerificationInput(
    sequenceNumber: unknown,
    description: unknown
): RestoreVerificationInput {
    if (!isValidRestoreSequence(sequenceNumber)) {
        throw new Error('Invalid restore point sequence number');
    }

    if (
        typeof description !== 'string' ||
        !description.trim() ||
        description.length > 512 ||
        Array.from(description).some((char) => char.charCodeAt(0) < 32)
    ) {
        throw new Error('Invalid restore point description');
    }

    return { sequenceNumber, description };
}
