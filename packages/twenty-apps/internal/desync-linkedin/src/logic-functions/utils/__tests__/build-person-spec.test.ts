import { describe, expect, it } from 'vitest';

import { buildPersonSpec } from 'src/logic-functions/utils/build-person-spec';

const person = {
  id: 'p-1',
  name: { firstName: 'Ana', lastName: 'Example' },
  emails: { primaryEmail: 'ana@acme.com' },
  jobTitle: 'Head of Partnerships',
  linkedinLink: { primaryLinkUrl: 'https://www.linkedin.com/in/ana-example' },
  company: { name: 'Acme Robotics' },
};

describe('buildPersonSpec', () => {
  it('sends the name, title and company, never the email or link', () => {
    const spec = buildPersonSpec(person);

    expect(spec.state).toEqual({
      person: {
        name: 'Ana Example',
        job_title: 'Head of Partnerships',
        company: 'Acme Robotics',
      },
    });
    expect(JSON.stringify(spec)).not.toMatch(/ana@acme|linkedin\.com/);
  });

  it('asks about the ICP only when a rubric is set', () => {
    expect(Object.keys(buildPersonSpec(person).questions)).toEqual(['person']);
    expect(Object.keys(buildPersonSpec(person, '  ').questions)).toEqual([
      'person',
    ]);
    expect(buildPersonSpec(person, 'Robotics founders').questions.icp).toEqual({
      type: 'noul',
      instructions: {
        question: 'Does `person` fit `target`?',
        target: 'Robotics founders',
      },
    });
  });
});
